"""Unit tests for the garmin_retry() helper and restore_client() retry logic."""

import time
from unittest.mock import MagicMock, patch

import pytest

from app.services.garmin import is_garmin_auth_error
from app.services.garmin_sync import _is_transient, garmin_retry


# ---------------------------------------------------------------------------
# _is_transient detection
# ---------------------------------------------------------------------------


class TestIsTransient:
    def test_timeout_is_transient(self):
        assert _is_transient(Exception("Connection timeout")) is True

    def test_connection_error_is_transient(self):
        assert _is_transient(Exception("connection reset by peer")) is True

    def test_503_is_transient(self):
        assert _is_transient(Exception("HTTP 503 Service Unavailable")) is True

    def test_502_is_transient(self):
        assert _is_transient(Exception("502 Bad Gateway")) is True

    def test_500_is_transient(self):
        assert _is_transient(Exception("500 Internal Server Error")) is True

    def test_reset_is_transient(self):
        assert _is_transient(Exception("Connection reset")) is True

    def test_timed_out_is_transient(self):
        assert _is_transient(Exception("request timed out")) is True

    def test_auth_error_not_transient(self):
        assert _is_transient(Exception("401 Unauthorized")) is False

    def test_not_found_not_transient(self):
        assert _is_transient(Exception("404 Not Found")) is False

    def test_generic_error_not_transient(self):
        assert _is_transient(Exception("Something went wrong")) is False


class TestGarminAuthErrorDetection:
    def test_missing_login_password_is_treated_as_auth_error(self):
        assert is_garmin_auth_error(Exception("login/password is not set")) is True

    def test_authentication_required_is_treated_as_auth_error(self):
        assert is_garmin_auth_error(Exception("Authentication required")) is True


# ---------------------------------------------------------------------------
# garmin_retry — success cases
# ---------------------------------------------------------------------------


class TestGarminRetrySuccess:
    def test_succeeds_on_first_attempt(self):
        func = MagicMock(return_value="ok")
        result = garmin_retry(func, "arg1", "arg2")
        assert result == "ok"
        func.assert_called_once_with("arg1", "arg2")

    @patch("app.services.garmin_sync.time.sleep")
    def test_succeeds_on_second_attempt_after_transient(self, mock_sleep):
        func = MagicMock(side_effect=[Exception("connection reset"), "ok"])
        result = garmin_retry(func, base_delay=1.0)
        assert result == "ok"
        assert func.call_count == 2
        mock_sleep.assert_called_once_with(1.0)  # base_delay * 2^0

    @patch("app.services.garmin_sync.time.sleep")
    def test_succeeds_on_third_attempt_after_two_transients(self, mock_sleep):
        func = MagicMock(side_effect=[
            Exception("timeout"),
            Exception("503 error"),
            "ok",
        ])
        result = garmin_retry(func, base_delay=1.0)
        assert result == "ok"
        assert func.call_count == 3
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(1.0)  # base_delay * 2^0
        mock_sleep.assert_any_call(2.0)  # base_delay * 2^1


# ---------------------------------------------------------------------------
# garmin_retry — failure cases
# ---------------------------------------------------------------------------


class TestGarminRetryFailure:
    def test_raises_immediately_on_auth_error(self):
        func = MagicMock(side_effect=Exception("401 Unauthorized"))
        with pytest.raises(Exception, match="401 Unauthorized"):
            garmin_retry(func)
        func.assert_called_once()

    def test_raises_immediately_on_not_found(self):
        func = MagicMock(side_effect=Exception("404 Not Found"))
        with pytest.raises(Exception, match="404 Not Found"):
            garmin_retry(func)
        func.assert_called_once()

    @patch("app.services.garmin_sync.time.sleep")
    def test_raises_after_max_retries_exhausted(self, mock_sleep):
        func = MagicMock(side_effect=Exception("connection timeout"))
        with pytest.raises(Exception, match="connection timeout"):
            garmin_retry(func, max_retries=2, base_delay=1.0)
        assert func.call_count == 3  # initial + 2 retries
        assert mock_sleep.call_count == 2


# ---------------------------------------------------------------------------
# garmin_retry — backoff timing
# ---------------------------------------------------------------------------


class TestGarminRetryBackoff:
    @patch("app.services.garmin_sync.time.sleep")
    def test_exponential_backoff_delays(self, mock_sleep):
        func = MagicMock(side_effect=[
            Exception("timeout"),
            Exception("timeout"),
            "ok",
        ])
        garmin_retry(func, max_retries=2, base_delay=0.5)
        assert mock_sleep.call_count == 2
        mock_sleep.assert_any_call(0.5)   # 0.5 * 2^0
        mock_sleep.assert_any_call(1.0)   # 0.5 * 2^1

    @patch("app.services.garmin_sync.time.sleep")
    def test_custom_base_delay(self, mock_sleep):
        func = MagicMock(side_effect=[Exception("500 error"), "ok"])
        garmin_retry(func, max_retries=2, base_delay=2.0)
        mock_sleep.assert_called_once_with(2.0)  # 2.0 * 2^0


# ---------------------------------------------------------------------------
# garmin_retry — kwargs forwarding
# ---------------------------------------------------------------------------


class TestGarminRetryKwargs:
    def test_forwards_kwargs(self):
        func = MagicMock(return_value="result")
        result = garmin_retry(func, "pos_arg", key="value")
        assert result == "result"
        func.assert_called_once_with("pos_arg", key="value")


# ---------------------------------------------------------------------------
# restore_client retry logic
# ---------------------------------------------------------------------------


class TestRestoreClientRetry:
    @patch("app.services.garmin.time.sleep")
    def test_retries_on_transient_refresh_error(self, mock_sleep):
        """restore_client retries _refresh_session on transient errors."""
        from unittest.mock import PropertyMock

        from app.services.garmin import restore_client

        session_data = {"token_store": '{"fake": "tokens"}'}

        with patch("app.services.garmin.Garmin") as MockGarmin:
            mock_client = MagicMock()
            MockGarmin.return_value = mock_client

            # Simulate token expiry check
            mock_client.client.di_refresh_token = "some_token"
            mock_client.client._token_expires_soon = MagicMock(return_value=True)

            # First call fails with transient error, second succeeds
            mock_client.client._refresh_session = MagicMock(
                side_effect=[Exception("connection timeout"), None]
            )

            client, refreshed = restore_client(session_data)
            assert refreshed is True
            assert mock_client.client._refresh_session.call_count == 2
            mock_sleep.assert_called_once_with(1.0)

    def test_raises_immediately_on_auth_refresh_error(self):
        """restore_client raises HTTPException immediately on auth errors."""
        from fastapi import HTTPException

        from app.services.garmin import restore_client

        session_data = {"token_store": '{"fake": "tokens"}'}

        with patch("app.services.garmin.Garmin") as MockGarmin:
            mock_client = MagicMock()
            MockGarmin.return_value = mock_client

            mock_client.client.di_refresh_token = "some_token"
            mock_client.client._token_expires_soon = MagicMock(return_value=True)
            mock_client.client._refresh_session = MagicMock(
                side_effect=Exception("401 Unauthorized")
            )

            with pytest.raises(HTTPException) as exc_info:
                restore_client(session_data)
            assert exc_info.value.status_code == 401
            mock_client.client._refresh_session.assert_called_once()

    @patch("app.services.garmin.time.sleep")
    def test_raises_after_max_retries_on_transient(self, mock_sleep):
        """restore_client raises after exhausting retries on transient errors."""
        from app.services.garmin import restore_client

        session_data = {"token_store": '{"fake": "tokens"}'}

        with patch("app.services.garmin.Garmin") as MockGarmin:
            mock_client = MagicMock()
            MockGarmin.return_value = mock_client

            mock_client.client.di_refresh_token = "some_token"
            mock_client.client._token_expires_soon = MagicMock(return_value=True)
            mock_client.client._refresh_session = MagicMock(
                side_effect=Exception("connection timeout")
            )

            with pytest.raises(Exception, match="connection timeout"):
                restore_client(session_data)
            assert mock_client.client._refresh_session.call_count == 3  # 1 + 2 retries
            assert mock_sleep.call_count == 2
