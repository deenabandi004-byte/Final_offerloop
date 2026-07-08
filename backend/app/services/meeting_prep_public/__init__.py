"""Public, anonymous meeting-prep lead magnet services.

Sibling of `meeting_prep_public` route (mounted at /api/tools/meeting-prep).
Separate package from the authenticated coffee-chat flow so the public
path can never touch user-scoped state.
"""
