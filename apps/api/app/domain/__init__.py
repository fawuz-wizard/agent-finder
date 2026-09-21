"""Pure business logic. Nothing in this package performs I/O: no database, HTTP, Google or
Supabase calls. Every function here takes plain values and returns plain values so it can be
unit-tested without infrastructure. Tests in tests/test_domain_purity.py enforce the import rule.

Modules
- freshness   : how old a status is → fresh / ageing / may_have_changed / expired
- capacity    : (private category, private thresholds, requested amount) → what the public may see
- visibility  : night mode, hidden, closed → whether availability may be shown at all
- ranking     : deterministic ordering with an explanation
"""
