"""Resume upload must fill in what it learned about the student."""
import pytest
pytestmark = pytest.mark.unit


class _Doc:
    def __init__(self, store, uid):
        self.store, self.uid = store, uid
    def get(self):
        return self
    def to_dict(self):
        return dict(self.store.get(self.uid, {}))
    def update(self, data):
        self.store.setdefault(self.uid, {}).update(data)


class _Coll:
    def __init__(self, store): self.store = store
    def document(self, uid): return _Doc(self.store, uid)


class _DB:
    def __init__(self, store): self.store = store
    def collection(self, name): return _Coll(self.store)


PARSED = {
    'name': 'Sara Wittig',
    'education': {
        'university': 'University of Southern California',
        'graduation': 'May 2027',
        'major': 'Business Administration',
    },
    'experience': [], 'projects': [],
}


def _save(monkeypatch, existing):
    from app.routes import resume as resume_route
    store = {'u1': dict(existing)}
    monkeypatch.setattr(resume_route, 'get_db', lambda: _DB(store))
    ok = resume_route.save_resume_to_firebase('u1', 'text', 'http://x/r.pdf', PARSED)
    assert ok
    return store['u1']


def test_blank_profile_is_filled_from_the_resume(monkeypatch):
    out = _save(monkeypatch, {})
    assert out['school'] == 'University of Southern California'
    assert out['academics.school'] == 'University of Southern California'
    assert out['gradYear'] == 'May 2027'
    assert out['major'] == 'Business Administration'
    assert out['name'] == 'Sara Wittig'
    assert out['resumeParsed'] == PARSED


def test_what_the_user_typed_always_wins(monkeypatch):
    out = _save(monkeypatch, {'school': 'UCLA', 'gradYear': '2026', 'name': 'Sara W.'})
    assert out['school'] == 'UCLA'
    assert out['gradYear'] == '2026'
    assert out['name'] == 'Sara W.'
    # The blank one still gets filled.
    assert out['major'] == 'Business Administration'


def test_nested_academics_counts_as_already_known(monkeypatch):
    out = _save(monkeypatch, {'academics': {'school': 'NYU'}})
    assert 'school' not in out or out.get('school') != 'University of Southern California'


def test_unknown_name_is_not_written(monkeypatch):
    from app.routes import resume as resume_route
    store = {'u1': {}}
    monkeypatch.setattr(resume_route, 'get_db', lambda: _DB(store))
    resume_route.save_resume_to_firebase('u1', 't', 'u', {'name': 'Unknown', 'education': {}})
    assert 'name' not in store['u1']


def test_upload_survives_a_backfill_failure(monkeypatch):
    from app.routes import resume as resume_route
    store = {'u1': {}}
    monkeypatch.setattr(resume_route, 'get_db', lambda: _DB(store))
    # education as a string, not a dict: the backfill must not take the upload down.
    assert resume_route.save_resume_to_firebase('u1', 't', 'u', {'education': 'BS, USC'})
    assert store['u1']['resumeText'] == 't'
