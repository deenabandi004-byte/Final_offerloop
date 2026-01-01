"""
Optimized Contact Search Service

This service implements an optimized contact search flow that:
1. Gets PDL results (single API call)
2. Quick extraction WITHOUT email verification
3. Scores and ranks candidates
4. Verifies emails one-by-one until we have enough (stops early)
"""
import time
from app.services.pdl_client import search_contacts_with_smart_location_strategy
from app.services.hunter import (
    verify_email_hunter, 
    find_email_with_hunter,
    is_personal_email_domain,
    get_smart_company_domain
)
from app.services.openai_client import get_openai_client


def contact_search_optimized(job_title, location, max_contacts=3, user_data=None, company=None, college_alumni=None, exclude_keys=None):
    """
    Optimized contact search that:
    1. Extracts basic info without email verification
    2. Scores and ranks candidates
    3. Verifies emails one-by-one, stopping when we have enough
    4. Returns pattern-generated emails as fallback
    """
    """
    Optimized contact search:
    1. Get PDL results
    2. Quick extraction WITHOUT email verification
    3. Score and rank candidates
    4. Verify emails one-by-one until we have enough
    """
    total_start = time.time()
    
    # Step 1: Get PDL results (single API call)
    print(f"\n[ContactSearch] ========================================")
    print(f"[ContactSearch] Starting optimized search")
    print(f"[ContactSearch] Job title: {job_title}, Location: {location}")
    print(f"[ContactSearch] Company: {company or 'Any'}")
    print(f"[ContactSearch] Target contacts: {max_contacts}")
    print(f"[ContactSearch] ========================================\n")
    
    start = time.time()
    # Get more results than needed (we'll rank and filter)
    pdl_contacts = search_contacts_with_smart_location_strategy(
        job_title, company, location, 
        max_contacts=40,  # Get 40 to have enough to rank
        college_alumni=college_alumni,
        exclude_keys=exclude_keys
    )
    print(f"[ContactSearch] PDL returned {len(pdl_contacts)} results in {time.time()-start:.1f}s")
    
    if not pdl_contacts:
        print(f"[ContactSearch] ❌ No PDL results found")
        return []
    
    # Step 2: Quick extraction WITHOUT email verification
    print(f"\n[ContactSearch] Extracting contact info (no email verification yet)...")
    candidates = []
    for contact in pdl_contacts:
        # Extract basic info from PDL contact format
        candidate = extract_contact_basic_from_pdl_contact(contact)
        if candidate:
            candidates.append(candidate)
    print(f"[ContactSearch] Extracted {len(candidates)} valid candidates")
    
    # Step 3: Score and rank candidates
    print(f"\n[ContactSearch] Scoring and ranking candidates...")
    candidates = score_and_rank_candidates(candidates, job_title)
    print(f"[ContactSearch] Top 5 candidates:")
    for i, c in enumerate(candidates[:5]):
        print(f"  {i+1}. {c['name']} - {c['title']} @ {c['company']} (score: {c.get('_score', 0)})")
    
    # Step 4: Two-pass verification
    print(f"\n[ContactSearch] === PASS 1: Verifying emails ===")
    
    verified_contacts = []
    unverified_contacts = []
    no_email_contacts = []
    max_attempts = min(len(candidates), max_contacts * 5)  # Try up to 5x what we need
    
    for i, candidate in enumerate(candidates[:max_attempts]):
        print(f"\n[ContactSearch] --- Candidate {i+1}/{max_attempts} ---")
        print(f"[ContactSearch] Processing: {candidate['name']} @ {candidate['company']}")
        
        # Pass target_company so we use the right domain
        email, is_verified = get_verified_email_for_contact_search(
            candidate, 
            target_company=company  # This is the company user searched for
        )
        
        if email:
            candidate['email'] = email
            candidate['is_verified_email'] = is_verified
            # Convert to standard format
            contact = {
                'FirstName': candidate.get('first_name', ''),
                'LastName': candidate.get('last_name', ''),
                'Email': email,
                'Title': candidate.get('title', ''),
                'Company': candidate.get('company', ''),
                'LinkedIn': candidate.get('linkedin_url', ''),
                'City': candidate.get('location', '').split(',')[0] if candidate.get('location') else '',
                'State': candidate.get('location', '').split(',')[1].strip() if ',' in (candidate.get('location') or '') else '',
                'WorkEmail': email if is_verified or not is_personal_email_domain(email.split('@')[1] if '@' in email else '') else '',
                'PersonalEmail': email if not is_verified and is_personal_email_domain(email.split('@')[1] if '@' in email else '') else '',
                'EmailSource': 'pdl' if candidate.get('_pdl_work_email') == email else 'hunter.io',
                'EmailVerified': is_verified,
                'is_verified_email': is_verified  # Add explicit flag
            }
            
            if is_verified:
                verified_contacts.append(contact)
                print(f"[ContactSearch] ✅ VERIFIED: {email}")
            else:
                unverified_contacts.append(contact)
                print(f"[ContactSearch] ⚠️ UNVERIFIED (saved for fallback): {email}")
        else:
            no_email_contacts.append(candidate)
            print(f"[ContactSearch] ❌ No email found")
    
    # Step 5: Combine results - verified first, then unverified
    print(f"\n[ContactSearch] === PASS 2: Combining results ===")
    print(f"[ContactSearch] Verified: {len(verified_contacts)}")
    print(f"[ContactSearch] Unverified (fallback): {len(unverified_contacts)}")
    print(f"[ContactSearch] No email: {len(no_email_contacts)}")
    
    final_contacts = []
    
    # Add verified contacts first
    for contact in verified_contacts:
        if len(final_contacts) >= max_contacts:
            break
        final_contacts.append(contact)
        print(f"[ContactSearch] Added VERIFIED: {contact['FirstName']} {contact['LastName']} → {contact['Email']}")
    
    # Fill remaining slots with unverified contacts
    remaining_slots = max_contacts - len(final_contacts)
    if remaining_slots > 0 and unverified_contacts:
        print(f"\n[ContactSearch] Filling {remaining_slots} remaining slots with unverified contacts...")
        for contact in unverified_contacts[:remaining_slots]:
            final_contacts.append(contact)
            print(f"[ContactSearch] Added UNVERIFIED: {contact['FirstName']} {contact['LastName']} → {contact['Email']}")
    
    total_time = time.time() - total_start
    verified_count = sum(1 for c in final_contacts if c.get('is_verified_email', False))
    unverified_count = len(final_contacts) - verified_count
    
    print(f"\n[ContactSearch] ========================================")
    print(f"[ContactSearch] 📊 SEARCH COMPLETE")
    print(f"[ContactSearch] Total time: {total_time:.1f}s")
    print(f"[ContactSearch] Contacts returned: {len(final_contacts)}/{max_contacts}")
    print(f"[ContactSearch]   ├── Verified: {verified_count}")
    print(f"[ContactSearch]   └── Unverified: {unverified_count}")
    print(f"[ContactSearch] ========================================\n")
    
    return final_contacts


def extract_contact_basic_from_pdl_contact(contact):
    """
    Quick contact extraction from PDL contact format WITHOUT email verification.
    Just extracts name, title, company, and raw email fields for later processing.
    """
    first_name = contact.get("FirstName", "")
    last_name = contact.get("LastName", "")
    
    if not first_name or not last_name:
        return None
    
    name = f"{first_name} {last_name}"
    
    # Extract emails from PDL contact format (use raw PDL data if available)
    work_email = contact.get("_pdl_work_email") or contact.get("WorkEmail", "")
    if work_email == "Not available" or not work_email:
        work_email = None
    
    # Use _pdl_personal_emails if available, otherwise fall back to PersonalEmail field
    personal_emails = contact.get("_pdl_personal_emails", [])
    if not personal_emails:
        personal_email = contact.get("PersonalEmail", "")
        if personal_email and personal_email != "Not available":
            personal_emails = [personal_email]
    
    # Get email from main Email field if WorkEmail is not available
    main_email = contact.get("Email", "")
    if main_email and main_email != "Not available" and main_email not in [work_email] + personal_emails:
        if not work_email:
            # Check if it's a work email by domain
            if main_email and "@" in main_email:
                domain = main_email.split("@")[1].lower()
                if not is_personal_email_domain(domain):
                    work_email = main_email
                else:
                    personal_emails.append(main_email)
    
    return {
        "name": name,
        "first_name": first_name,
        "last_name": last_name,
        "title": contact.get("Title", ""),
        "company": contact.get("Company", ""),
        "linkedin_url": contact.get("LinkedIn", ""),
        "location": f"{contact.get('City', '')}, {contact.get('State', '')}".strip(", "),
        # Store raw data for email verification later
        "_pdl_work_email": work_email,
        "_pdl_personal_emails": personal_emails,
        "_pdl_company_website": None,  # Not available in PDL contact format
    }


def score_and_rank_candidates(candidates, target_job_title):
    """
    Rank candidates by likelihood of having a valid email.
    Higher score = more likely to succeed, try these first.
    """
    target_lower = target_job_title.lower()
    target_words = set(target_lower.split())
    
    for c in candidates:
        score = 0
        title = c.get("title", "").lower()
        
        # Job title relevance
        if target_lower in title:
            score += 30  # Exact match
        else:
            matching_words = sum(1 for word in target_words if word in title)
            score += matching_words * 10  # Partial match
        
        # Has PDL work email (huge indicator of success)
        pdl_email = c.get("_pdl_work_email", "")
        if pdl_email and not is_personal_email_domain(pdl_email):
            score += 40  # Work email from PDL = very likely to verify
        elif pdl_email:
            score += 10  # Personal email is backup
        
        # Has personal emails as fallback
        if c.get("_pdl_personal_emails"):
            score += 5
        
        # Has LinkedIn (useful for user even if not for email)
        if c.get("linkedin_url"):
            score += 5
        
        # Company is well-known (Hunter more likely to have data)
        company = c.get("company", "").lower()
        well_known = ["google", "meta", "amazon", "microsoft", "apple", "netflix", 
                      "deloitte", "pwc", "kpmg", "ey", "ernst", "accenture", "mckinsey",
                      "jpmorgan", "goldman", "morgan stanley", "bank of america",
                      "walmart", "target", "costco", "disney", "warner", "sony"]
        if any(wk in company for wk in well_known):
            score += 15
        
        c["_score"] = score
    
    # Sort by score descending
    candidates.sort(key=lambda x: x.get("_score", 0), reverse=True)
    return candidates


def get_verified_email_for_contact_search(candidate, target_company=None):
    """
    Get email for a contact. Always tries to return an email, even if unverified.
    
    Args:
        candidate: Contact dict with _pdl_work_email, _pdl_personal_emails, company, etc.
        target_company: If user searched for a specific company, use this domain directly
    
    Returns: (email, is_verified)
        - is_verified=True: Email was verified by Hunter (score >= 80)
        - is_verified=False: Email is pattern-generated or unverified
    """
    first_name = candidate.get("first_name", "")
    last_name = candidate.get("last_name", "")
    company = candidate.get("company", "")
    pdl_work_email = candidate.get("_pdl_work_email", "")
    personal_emails = candidate.get("_pdl_personal_emails", [])
    company_website = candidate.get("_pdl_company_website") or None
    
    print(f"[EmailVerify] Processing: {first_name} {last_name}")
    print(f"[EmailVerify] Company: {company}, Target: {target_company}")
    print(f"[EmailVerify] PDL work email: {pdl_work_email}")
    
    # === DETERMINE TARGET DOMAIN ===
    if target_company:
        # User searched for specific company - use that domain directly
        target_domain = get_smart_company_domain(target_company, company_website)
        print(f"[EmailVerify] Using target company domain: {target_domain}")
    elif pdl_work_email and not is_personal_email_domain(pdl_work_email):
        # No target company specified, use PDL's email domain
        target_domain = pdl_work_email.split("@")[1].lower()
        print(f"[EmailVerify] Using PDL email domain: {target_domain}")
    else:
        # Fall back to company name from PDL
        target_domain = get_smart_company_domain(company, company_website)
        print(f"[EmailVerify] Using company name domain: {target_domain}")
    
    if not target_domain:
        print(f"[EmailVerify] ❌ Could not determine domain")
        if personal_emails:
            print(f"[EmailVerify] Returning personal email as fallback: {personal_emails[0]}")
            return personal_emails[0], False
        return None, False
    
    # === STRATEGY 1: Check if PDL email matches target domain ===
    if pdl_work_email and "@" in pdl_work_email:
        pdl_domain = pdl_work_email.split("@")[1].lower()
        if pdl_domain == target_domain:
            print(f"[EmailVerify] PDL email matches target domain, verifying: {pdl_work_email}")
            result = verify_email_hunter(pdl_work_email)
            score = result.get("score", 0) if result else 0
            if score >= 80:
                print(f"[EmailVerify] ✅ PDL email verified: {pdl_work_email}")
                return pdl_work_email, True
            else:
                print(f"[EmailVerify] PDL email failed verification (score: {score}), trying other strategies")
    
    # === STRATEGY 2: Hunter Email Finder ===
    print(f"[EmailVerify] Trying Hunter Email Finder with domain: {target_domain}")
    email, score = find_email_with_hunter(first_name, last_name, target_domain)
    if email and score >= 80:
        print(f"[EmailVerify] ✅ Hunter found verified email: {email} (score: {score})")
        return email, True
    
    # === STRATEGY 3: Pattern-generated email (return even if unverified) ===
    print(f"[EmailVerify] Hunter failed, trying pattern generation for: {target_domain}")
    from app.services.hunter import get_domain_pattern, generate_email_from_pattern
    
    pattern = get_domain_pattern(target_domain)
    
    if pattern:
        generated_email = generate_email_from_pattern(first_name, last_name, target_domain, pattern)
        if generated_email:
            print(f"[EmailVerify] Generated email from pattern '{pattern}': {generated_email}")
            
            # Try to verify it
            result = verify_email_hunter(generated_email)
            score = result.get("score", 0) if result else 0
            
            if score >= 80:
                print(f"[EmailVerify] ✅ Pattern email verified: {generated_email}")
                return generated_email, True
            else:
                # Return it anyway as unverified
                print(f"[EmailVerify] ⚠️ Pattern email unverified (score: {score}), returning anyway: {generated_email}")
                return generated_email, False
    
    # === STRATEGY 4: Generate using common patterns ===
    print(f"[EmailVerify] No pattern found, generating with common pattern")
    if first_name and last_name:
        # Try {f}{last} pattern (most common)
        fallback_email = f"{first_name[0].lower()}{last_name.lower()}@{target_domain}"
        print(f"[EmailVerify] ⚠️ Using fallback pattern (unverified): {fallback_email}")
        return fallback_email, False
    
    # === STRATEGY 5: Personal email (last resort) ===
    if personal_emails:
        print(f"[EmailVerify] ⚠️ Returning personal email: {personal_emails[0]}")
        return personal_emails[0], False
    
    print(f"[EmailVerify] ❌ Could not generate any email")
    return None, False

