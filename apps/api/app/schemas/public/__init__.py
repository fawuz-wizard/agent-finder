"""PUBLIC response models — what an unauthenticated customer may receive.

Rule (enforced by tests/test_public_schema_privacy.py):
- this package must never import from app.schemas.internal
- no model here may define a field whose name contains: category, threshold, capacity, balance
"""
