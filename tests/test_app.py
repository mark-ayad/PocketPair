"""Smoke tests for the PocketPair Flask app.

Run directly:   python3 tests/test_app.py
Or with pytest: pytest tests/

Uses a throwaway history file so it never touches data/gameHistory.json.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))
import app as pocket  # noqa: E402


def _client(tmp_dir):
    # Point history at a temp file so the test doesn't mutate real data.
    pocket.HISTORY_PATH = os.path.join(tmp_dir, 'gameHistory.json')
    pocket.app.config['TESTING'] = True
    return pocket.app.test_client()


def test_index_serves():
    with tempfile.TemporaryDirectory() as d:
        resp = _client(d).get('/')
        assert resp.status_code == 200, resp.status_code


def test_daily_puzzle_shape_and_blinds():
    with tempfile.TemporaryDirectory() as d:
        resp = _client(d).get('/api/daily-puzzle')
        assert resp.status_code == 200, resp.status_code
        data = resp.get_json()
        for field in ('id', 'VillainSolution', 'ActionHistory',
                      'smallBlind', 'bigBlind', 'ante'):
            assert field in data, f'missing field: {field}'
        assert data['bigBlind'] > 0


def test_security_headers_present():
    with tempfile.TemporaryDirectory() as d:
        resp = _client(d).get('/')
        assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
        assert resp.headers.get('X-Frame-Options') == 'DENY'
        assert 'Content-Security-Policy' in resp.headers


def test_daily_puzzle_is_stable_same_day():
    with tempfile.TemporaryDirectory() as d:
        client = _client(d)
        first = client.get('/api/daily-puzzle').get_json()['id']
        second = client.get('/api/daily-puzzle').get_json()['id']
        assert first == second


if __name__ == '__main__':
    test_index_serves()
    test_daily_puzzle_shape_and_blinds()
    test_security_headers_present()
    test_daily_puzzle_is_stable_same_day()
    print('All smoke tests passed.')
