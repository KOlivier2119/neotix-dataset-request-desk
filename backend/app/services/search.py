"""Helpers for building case-insensitive substring filters."""


def like_pattern(term: str) -> str:
    """Escape a user-supplied term and wrap it for an ILIKE "contains" match.

    `%` and `_` are wildcards in SQL LIKE patterns, so a user searching for
    "ep_1" must not match "epx1". Backslash is escaped first so the later
    replacements stay correct.
    """
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"
