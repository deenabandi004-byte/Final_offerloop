"""Voice overhaul P2: POST /api/mobile/scout/transcribe-ask.

Covers: auth, bad/oversize/overlong files, transcription-exception fallback
to the Apple transcript (still one round trip), metering on both paths, and
the WAV-header duration math (never assume 16kHz — iOS may emit 44.1k).
"""
import io
import json
import struct
from unittest.mock import MagicMock, patch

import pytest

# The test app is built from backend.wsgi, so the LIVE route module is the
# backend.-prefixed copy — patch that one, not app.routes.mobile.
from backend.app.routes import mobile as mobile_route


pytestmark = pytest.mark.unit


def _wav_bytes(seconds: float, sample_rate: int = 16000, bits: int = 16) -> bytes:
    """Minimal valid PCM WAV of the given duration."""
    byte_rate = sample_rate * bits // 8
    data_size = int(seconds * byte_rate)
    hdr = b'RIFF' + struct.pack('<I', 36 + data_size) + b'WAVE'
    hdr += b'fmt ' + struct.pack('<IHHIIHH', 16, 1, 1, sample_rate, byte_rate, bits // 8, bits)
    hdr += b'data' + struct.pack('<I', data_size)
    return hdr + b'\x00' * data_size


class TestWavDuration:
    def test_16k_duration(self):
        assert abs(mobile_route._wav_duration_seconds(_wav_bytes(5.0)) - 5.0) < 0.05

    def test_44k_duration_not_assumed_16k(self):
        d = mobile_route._wav_duration_seconds(_wav_bytes(5.0, sample_rate=44100))
        assert abs(d - 5.0) < 0.05  # header math, not byte-count guessing

    def test_garbage_returns_zero(self):
        assert mobile_route._wav_duration_seconds(b'not a wav') == 0.0


def _post(client, headers, *, audio=None, filename='ask.wav', apple='draft two analysts at Moelis'):
    data = {'askId': 'ask-1', 'apple_transcript': apple, 'hint_companies': json.dumps(['Moelis'])}
    if audio is not None:
        data['audio'] = (io.BytesIO(audio), filename)
    return client.post(
        '/api/mobile/scout/transcribe-ask',
        data=data, headers=headers, content_type='multipart/form-data',
    )


@pytest.fixture
def auth_patches(mock_firebase_user):
    # Same bypass shape as test_find_humans.py: fake an initialized admin app
    # and stub token verification at the firebase_admin level.
    with patch('firebase_admin._apps', {'[DEFAULT]': MagicMock()}), \
         patch('firebase_admin.auth.verify_id_token', return_value=mock_firebase_user), \
         patch.object(mobile_route, 'get_db', return_value=MagicMock()):
        yield {'Authorization': 'Bearer test-token'}


class TestTranscribeAsk:
    def test_unauthenticated_401(self, client):
        r = _post(client, {}, audio=_wav_bytes(2))
        assert r.status_code == 401

    def test_missing_file_400(self, client, auth_patches):
        r = _post(client, auth_patches, audio=None)
        assert r.status_code == 400

    def test_wrong_extension_400(self, client, auth_patches):
        r = _post(client, auth_patches, audio=_wav_bytes(2), filename='ask.mp3')
        assert r.status_code == 400

    def test_too_long_400(self, client, auth_patches):
        r = _post(client, auth_patches, audio=_wav_bytes(120))
        assert r.status_code == 400

    def test_success_uses_audio_transcript_and_meters(self, client, auth_patches):
        tr = MagicMock()
        tr.text = 'Draft 2 analysts at Moelis'
        tr.usage = MagicMock(input_tokens=100, output_tokens=12)
        with patch.object(mobile_route, '_transcribe_hits', {}), \
             patch('app.services.openai_client.get_openai_client') as gc, \
             patch('app.services.metering.log_transcription_usage') as meter, \
             patch('app.services.scout_intent.classify_scout_ask') as cls:
            gc.return_value.audio.transcriptions.create.return_value = tr
            cls.return_value = {'intent': 'draft_outreach', 'company': 'Moelis', 'repaired': False}
            r = _post(client, auth_patches, audio=_wav_bytes(3))
        assert r.status_code == 200
        body = r.get_json()
        assert body['transcript_source'] == 'audio'
        assert body['transcript'] == 'Draft 2 analysts at Moelis'
        assert body['classification']['company'] == 'Moelis'
        meter.assert_called_once()
        assert meter.call_args.kwargs.get('status') == 'ok'
        # Vocabulary biasing actually reaches the API call.
        prompt = gc.return_value.audio.transcriptions.create.call_args.kwargs['prompt']
        assert 'Moelis' in prompt

    def test_transcription_exception_falls_back_to_apple(self, client, auth_patches):
        with patch.object(mobile_route, '_transcribe_hits', {}), \
             patch('app.services.openai_client.get_openai_client') as gc, \
             patch('app.services.metering.log_transcription_usage') as meter, \
             patch('app.services.scout_intent.classify_scout_ask') as cls:
            gc.return_value.audio.transcriptions.create.side_effect = RuntimeError('api down')
            cls.return_value = {'intent': 'draft_outreach', 'company': 'Moelis', 'repaired': True}
            r = _post(client, auth_patches, audio=_wav_bytes(3))
        assert r.status_code == 200
        body = r.get_json()
        assert body['transcript_source'] == 'apple'
        assert body['transcript'] == 'draft two analysts at Moelis'
        assert body['classification']['intent'] == 'draft_outreach'
        meter.assert_called_once()
        assert meter.call_args.kwargs.get('status') == 'error'

    def test_rate_limited_429(self, client, auth_patches):
        with patch.object(mobile_route, '_transcribe_rate_limited', return_value=True):
            r = _post(client, auth_patches, audio=_wav_bytes(2))
        assert r.status_code == 429
