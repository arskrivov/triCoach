"""Pytest configuration for backend tests.

The backend uses Supabase (not SQLAlchemy), so all tests are either:
- Pure unit tests with no database dependency (test_dashboard_utils.py,
  test_dashboard_helpers.py, test_dashboard_integration.py, test_routes.py)
- Integration tests that mock the Supabase client directly

No shared fixtures are required.
"""
