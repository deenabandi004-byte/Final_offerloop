"""
Optimized Contact Search Service

This service implements an optimized contact search flow that:
1. Gets PDL results (single API call)
2. Quick extraction WITHOUT email verification
3. Scores and ranks candidates
4. Verifies emails in parallel until we have enough (stops early)
"""
import time
import concurrent.futures
import threading
from app.services.pdl_client import search_contacts_with_smart_location_strategy
from app.services.hunter import (
    verify_email_hunter, 
    find_email_with_hunter,
    is_personal_email_domain,
    get_smart_company_domain
)
from app.services.openai_client import get_openai_client

# Timing statistics
_timing_stats = {
    'pdl_search': 0.0,
    'extraction': 0.0,
    'scoring': 0.0,
    'domain_lookups': 0.0,
    'hunter_email_finder': 0.0,
    'hunter_email_verifier': 0.0,
    'hunter_domain_pattern': 0.0,
    'openai_domain_lookup': 0.0,
    'total': 0.0
}

# Parallel verification configuration
MAX_VERIFICATION_WORKERS = 4  # Process 4 candidates simultaneously


def verify_contacts_parallel(candidates, max_contacts, company):
    """
    Verify multiple candidates in parallel, stopping when we have enough verified contacts.
    
    Args:
        candidates: List of candidate dicts to verify
        max_contacts: Target number of verified contacts needed
        company: Target company name for domain matching
    
    Returns:
        Tuple of (verified_results, unverified_results, no_email_candidates)
        Each result contains: candidate, email, is_verified
    """
    verified_results = []
    unverified_results = []
    no_email_candidates = []
    verified_lock = threading.Lock()
    enough_verified = threading.Event()
    
    print(f"[ContactSearch] 🚀 Starting parallel verification with {MAX_VERIFICATION_WORKERS} workers")
    print(f"[ContactSearch] Processing {len(candidates)} candidates, target: {max_contacts} verified")
    
    start_time = time.time()
    
    def verify_single_candidate(candidate, candidate_idx):
        """Verify a single candidate and return result."""
        # Check if we already have enough (early stopping)
        if enough_verified.is_set():
            return None
        
        candidate_start = time.time()
        candidate_name = f"{candidate.get('first_name', '')} {candidate.get('last_name', '')}".strip()
        
        try:
            print(f"[ContactSearch] ⏱️  [Worker] Starting candidate {candidate_idx+1}: {candidate_name} @ {candidate.get('company', '')}")
            
            email, is_verified = get_verified_email_for_contact_search(
                candidate, target_company=company
            )
            
            duration = time.time() - candidate_start
            
            # Check again if we have enough before processing result
            if enough_verified.is_set():
                return None
            
            if email:
                result = {
                    'candidate': candidate,
                    'email': email,
                    'is_verified': is_verified,
                    'duration': duration,
                    'candidate_idx': candidate_idx
                }
                
                with verified_lock:
                    if is_verified:
                        verified_results.append(result)
                        current_verified = len(verified_results)
                        print(f"[ContactSearch] ✅ [Worker] VERIFIED ({duration:.2f}s): {email} - {candidate_name} (verified: {current_verified}/{max_contacts})")
                        
                        if current_verified >= max_contacts:
                            enough_verified.set()
                            print(f"[ContactSearch] ⚡ [Worker] Reached target of {max_contacts} verified contacts!")
                    else:
                        unverified_results.append(result)
                        print(f"[ContactSearch] ⚠️ [Worker] UNVERIFIED ({duration:.2f}s): {email} - {candidate_name}")
                
                return result
            else:
                with verified_lock:
                    no_email_candidates.append(candidate)
                print(f"[ContactSearch] ❌ [Worker] No email found ({duration:.2f}s): {candidate_name}")
                return None
                
        except Exception as e:
            duration = time.time() - candidate_start
            print(f"[ContactSearch] ⚠️ [Worker] Error verifying candidate {candidate_idx+1} ({duration:.2f}s): {str(e)}")
            with verified_lock:
                no_email_candidates.append(candidate)
            return None
    
    # Process candidates in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_VERIFICATION_WORKERS) as executor:
        # Submit all candidates
        future_to_candidate = {
            executor.submit(verify_single_candidate, candidate, idx): (candidate, idx)
            for idx, candidate in enumerate(candidates)
        }
        
        # Collect results as they complete
        completed = 0
        for future in concurrent.futures.as_completed(future_to_candidate):
            candidate, idx = future_to_candidate[future]
            completed += 1
            
            try:
                result = future.result()
                # Result is already added to lists in the worker function
                
                # Check if we should stop early
                with verified_lock:
                    current_verified = len(verified_results)
                    if current_verified >= max_contacts and not enough_verified.is_set():
                        enough_verified.set()
                        print(f"[ContactSearch] ⚡ Early stopping: {current_verified} verified contacts (target: {max_contacts})")
                        # Cancel remaining futures
                        for f in future_to_candidate:
                            if not f.done():
                                f.cancel()
                        break
                        
            except Exception as e:
                print(f"[ContactSearch] ⚠️ Error processing future for candidate {idx+1}: {str(e)}")
                with verified_lock:
                    if candidate not in no_email_candidates:
                        no_email_candidates.append(candidate)
    
    total_duration = time.time() - start_time
    verified_count = len(verified_results)
    unverified_count = len(unverified_results)
    no_email_count = len(no_email_candidates)
    
    print(f"\n[ContactSearch] ⏱️  Parallel verification complete: {total_duration:.2f}s")
    print(f"[ContactSearch] 📊 Results: {verified_count} verified, {unverified_count} unverified, {no_email_count} no email")
    if verified_count > 0:
        avg_time = total_duration / verified_count
        print(f"[ContactSearch] 📊 Average time per verified contact: {avg_time:.2f}s")
    
    return verified_results, unverified_results, no_email_candidates


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
    # Reset timing stats
    global _timing_stats
    _timing_stats = {
        'pdl_search': 0.0,
        'extraction': 0.0,
        'scoring': 0.0,
        'domain_lookups': 0.0,
        'hunter_email_finder': 0.0,
        'hunter_email_verifier': 0.0,
        'hunter_domain_pattern': 0.0,
        'openai_domain_lookup': 0.0,
        'email_verification_total': 0.0,
        'total': 0.0
    }
    
    total_start = time.time()
    
    # Step 1: Get PDL results (single API call)
    print(f"\n[ContactSearch] ========================================")
    print(f"[ContactSearch] ⏱️  Starting optimized search")
    print(f"[ContactSearch] Job title: {job_title}, Location: {location}")
    print(f"[ContactSearch] Company: {company or 'Any'}")
    print(f"[ContactSearch] Target contacts: {max_contacts}")
    print(f"[ContactSearch] ========================================\n")
    
    pdl_start = time.time()
    # Calculate smarter fetch size
    # Use 2.5x multiplier, with min of 10 and max of 25
    fetch_multiplier = 2.5
    min_fetch = 10
    max_fetch = 25
    
    fetch_size = min(max(int(max_contacts * fetch_multiplier), min_fetch), max_fetch)
    
    print(f"[ContactSearch] 📊 Fetch size calculation:")
    print(f"[ContactSearch]   ├── Requested contacts: {max_contacts}")
    print(f"[ContactSearch]   ├── Multiplier: {fetch_multiplier}x")
    print(f"[ContactSearch]   ├── Calculated: {int(max_contacts * fetch_multiplier)}")
    print(f"[ContactSearch]   ├── After min/max: {fetch_size}")
    print(f"[ContactSearch]   └── Savings: {40 - fetch_size} fewer contacts fetched")
    
    # Get more results than needed (we'll rank and filter)
    pdl_contacts = search_contacts_with_smart_location_strategy(
        job_title, company, location, 
        max_contacts=fetch_size,  # Dynamic, not hardcoded 40
        college_alumni=college_alumni,
        exclude_keys=exclude_keys
    )
    pdl_time = time.time() - pdl_start
    _timing_stats['pdl_search'] = pdl_time
    print(f"[ContactSearch] ⏱️  PDL search: {pdl_time:.2f}s - returned {len(pdl_contacts)} results")
    
    if not pdl_contacts:
        print(f"[ContactSearch] ❌ No PDL results found")
        return []
    
    # Step 2: Quick extraction WITHOUT email verification
    extract_start = time.time()
    print(f"\n[ContactSearch] ⏱️  Extracting contact info (no email verification yet)...")
    candidates = []
    for contact in pdl_contacts:
        # Extract basic info from PDL contact format
        candidate = extract_contact_basic_from_pdl_contact(contact)
        if candidate:
            candidates.append(candidate)
    extract_time = time.time() - extract_start
    _timing_stats['extraction'] = extract_time
    print(f"[ContactSearch] ⏱️  Extraction: {extract_time:.2f}s - extracted {len(candidates)} valid candidates")
    
    # Step 3: Score and rank candidates
    score_start = time.time()
    print(f"\n[ContactSearch] ⏱️  Scoring and ranking candidates...")
    candidates = score_and_rank_candidates(candidates, job_title)
    score_time = time.time() - score_start
    _timing_stats['scoring'] = score_time
    print(f"[ContactSearch] ⏱️  Scoring: {score_time:.2f}s")
    print(f"[ContactSearch] Top 5 candidates:")
    for i, c in enumerate(candidates[:5]):
        print(f"  {i+1}. {c['name']} - {c['title']} @ {c['company']} (score: {c.get('_score', 0)})")
    
    # Step 4: Parallel verification
    verify_start = time.time()
    print(f"\n[ContactSearch] ⏱️  === PASS 1: Verifying emails (parallel) ===")
    
    max_attempts = min(len(candidates), max_contacts * 5)  # Try up to 5x what we need
    
    # Verify candidates in parallel
    verified_results, unverified_results, no_email_candidates = verify_contacts_parallel(
        candidates=candidates[:max_attempts],
        max_contacts=max_contacts,
        company=company
    )
    
    # Convert results to standard contact format
    # Sort by candidate_idx to maintain original ranking order
    verified_results.sort(key=lambda r: r.get('candidate_idx', 0))
    unverified_results.sort(key=lambda r: r.get('candidate_idx', 0))
    
    verified_contacts = []
    unverified_contacts = []
    no_email_contacts = []
    
    def convert_result_to_contact(result):
        """Convert a verification result to standard contact format."""
        candidate = result['candidate']
        email = result['email']
        is_verified = result['is_verified']
        
        return {
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
    
    # Convert verified results
    for result in verified_results:
        verified_contacts.append(convert_result_to_contact(result))
    
    # Convert unverified results
    for result in unverified_results:
        unverified_contacts.append(convert_result_to_contact(result))
    
    # No email candidates are already in the right format
    no_email_contacts = no_email_candidates
    
    verify_time = time.time() - verify_start
    _timing_stats['email_verification_total'] = verify_time
    print(f"\n[ContactSearch] ⏱️  Email verification phase: {verify_time:.2f}s")
    
    # Step 5: Combine results - verified first, then unverified
    print(f"\n[ContactSearch] ⏱️  === PASS 2: Combining results ===")
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
    _timing_stats['total'] = total_time
    verified_count = sum(1 for c in final_contacts if c.get('is_verified_email', False))
    unverified_count = len(final_contacts) - verified_count
    
    # Print detailed timing breakdown
    print(f"\n[ContactSearch] ========================================")
    print(f"[ContactSearch] 📊 SEARCH COMPLETE - TIMING BREAKDOWN")
    print(f"[ContactSearch] ========================================")
    print(f"[ContactSearch] ⏱️  Total time: {total_time:.2f}s")
    print(f"[ContactSearch] ⏱️  PDL search: {_timing_stats['pdl_search']:.2f}s ({_timing_stats['pdl_search']/total_time*100:.1f}%)")
    print(f"[ContactSearch] ⏱️  Extraction: {_timing_stats['extraction']:.2f}s ({_timing_stats['extraction']/total_time*100:.1f}%)")
    print(f"[ContactSearch] ⏱️  Scoring: {_timing_stats['scoring']:.2f}s ({_timing_stats['scoring']/total_time*100:.1f}%)")
    print(f"[ContactSearch] ⏱️  Email verification: {_timing_stats['email_verification_total']:.2f}s ({_timing_stats['email_verification_total']/total_time*100:.1f}%)")
    print(f"[ContactSearch]     ├── Domain lookups: {_timing_stats['domain_lookups']:.2f}s")
    print(f"[ContactSearch]     ├── Hunter Email Finder: {_timing_stats['hunter_email_finder']:.2f}s")
    print(f"[ContactSearch]     ├── Hunter Email Verifier: {_timing_stats['hunter_email_verifier']:.2f}s")
    print(f"[ContactSearch]     ├── Hunter Domain Pattern: {_timing_stats['hunter_domain_pattern']:.2f}s")
    print(f"[ContactSearch]     └── OpenAI domain lookup: {_timing_stats['openai_domain_lookup']:.2f}s")
    print(f"[ContactSearch] 📊 Contacts returned: {len(final_contacts)}/{max_contacts}")
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
    global _timing_stats
    
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
    domain_start = time.time()
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
    domain_time = time.time() - domain_start
    _timing_stats['domain_lookups'] += domain_time
    
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
            verify_start = time.time()
            result = verify_email_hunter(pdl_work_email)
            verify_time = time.time() - verify_start
            _timing_stats['hunter_email_verifier'] += verify_time
            score = result.get("score", 0) if result else 0
            if score >= 80:
                print(f"[EmailVerify] ✅ PDL email verified: {pdl_work_email} ({verify_time:.2f}s)")
                return pdl_work_email, True
            else:
                print(f"[EmailVerify] PDL email failed verification (score: {score}, {verify_time:.2f}s), trying other strategies")
    
    # === STRATEGY 2: Hunter Email Finder ===
    print(f"[EmailVerify] Trying Hunter Email Finder with domain: {target_domain}")
    finder_start = time.time()
    email, score = find_email_with_hunter(first_name, last_name, target_domain)
    finder_time = time.time() - finder_start
    _timing_stats['hunter_email_finder'] += finder_time
    if email and score >= 80:
        print(f"[EmailVerify] ✅ Hunter found verified email: {email} (score: {score}, {finder_time:.2f}s)")
        return email, True
    
    # === STRATEGY 3: Pattern-generated email (return even if unverified) ===
    print(f"[EmailVerify] Hunter failed, trying pattern generation for: {target_domain}")
    from app.services.hunter import get_domain_pattern, generate_email_from_pattern
    
    pattern_start = time.time()
    pattern = get_domain_pattern(target_domain)
    pattern_time = time.time() - pattern_start
    _timing_stats['hunter_domain_pattern'] += pattern_time
    
    if pattern:
        generated_email = generate_email_from_pattern(first_name, last_name, target_domain, pattern)
        if generated_email:
            print(f"[EmailVerify] Generated email from pattern '{pattern}': {generated_email} (pattern lookup: {pattern_time:.2f}s)")
            
            # Try to verify it
            verify_start = time.time()
            result = verify_email_hunter(generated_email)
            verify_time = time.time() - verify_start
            _timing_stats['hunter_email_verifier'] += verify_time
            score = result.get("score", 0) if result else 0
            
            if score >= 80:
                print(f"[EmailVerify] ✅ Pattern email verified: {generated_email} ({verify_time:.2f}s)")
                return generated_email, True
            else:
                # Return it anyway as unverified
                print(f"[EmailVerify] ⚠️ Pattern email unverified (score: {score}, {verify_time:.2f}s), returning anyway: {generated_email}")
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

