# backend/app/services/importer.py
import csv
from datetime import datetime
from sqlalchemy.orm import Session

KNOWN_ROBOTS = {'arm-01', 'arm-02', 'arm-03', 'mobile-01', 'humanoid-01'}
VALID_QUALITY = {'good', 'usable', 'bad'}
EXPECTED_COLUMNS = {'episode_id', 'robot_id', 'task_name', 'recorded_at', 'duration_seconds', 'operator_name', 'quality'}
DATE_FORMATS = [
    '%Y-%m-%dT%H:%M:%S',
    '%d/%m/%Y %H:%M',
    '%Y-%m-%d %H:%M:%S',
    '%Y-%m-%dT%H:%M:%SZ',
]
BATCH_SIZE = 500


def _normalise_row(row: dict) -> dict:
    """Apply normalisation rules to a CSV row in order."""
    # Trim whitespace on ALL fields
    normalised = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}

    # Uppercase episode_id
    if 'episode_id' in normalised and normalised['episode_id']:
        normalised['episode_id'] = normalised['episode_id'].upper()

    # Lowercase quality
    if 'quality' in normalised and normalised['quality']:
        normalised['quality'] = normalised['quality'].lower()

    # Strip whitespace and lowercase task_name (strip already done above, just lowercase)
    if 'task_name' in normalised and normalised['task_name']:
        normalised['task_name'] = normalised['task_name'].lower()

    # robot_id whitespace already stripped above (no further transform needed)

    return normalised


def _parse_row(row: dict) -> tuple[dict | None, str | None]:
    """Normalise and validate a CSV row.

    Returns:
        (cleaned_dict, None)  on success
        (None, reason_string) on rejection
    """
    # Check for missing expected columns
    if not EXPECTED_COLUMNS.issubset(row.keys()):
        return None, "malformed row: wrong column count"

    row = _normalise_row(row)

    # Trailing blank lines — all fields empty → skip silently (caller checks)
    # We signal this as a special None reason so the caller can skip without counting as rejected
    if all(not row.get(col) for col in EXPECTED_COLUMNS):
        return None, "__blank_row__"

    # episode_id
    if not row.get('episode_id'):
        return None, "missing episode_id"

    # robot_id
    if not row.get('robot_id'):
        return None, "missing robot_id"
    if row['robot_id'] not in KNOWN_ROBOTS:
        return None, f"unknown robot_id: {row['robot_id']}"

    # quality
    if not row.get('quality'):
        return None, "missing quality"
    if row['quality'] not in VALID_QUALITY:
        return None, f"invalid quality: {row['quality']}"

    # duration_seconds
    raw_duration = row.get('duration_seconds', '')
    if not raw_duration:
        return None, "missing duration_seconds"
    try:
        duration_int = int(float(raw_duration))
    except (ValueError, TypeError):
        return None, f"invalid duration_seconds: {raw_duration}"
    if duration_int <= 0:
        return None, "duration_seconds must be > 0"

    # operator_name
    if not row.get('operator_name'):
        return None, "missing operator_name"

    # recorded_at
    raw_recorded_at = row.get('recorded_at', '')
    if not raw_recorded_at:
        return None, f"invalid recorded_at: {raw_recorded_at}"
    recorded_at_dt = None
    for fmt in DATE_FORMATS:
        try:
            recorded_at_dt = datetime.strptime(raw_recorded_at, fmt)
            break
        except ValueError:
            continue
    if recorded_at_dt is None:
        return None, f"invalid recorded_at: {raw_recorded_at}"

    cleaned = {
        'episode_id': row['episode_id'],
        'robot_id': row['robot_id'],
        'task_name': row['task_name'],
        'recorded_at': recorded_at_dt,
        'duration_seconds': duration_int,
        'operator_name': row['operator_name'],
        'quality': row['quality'],
    }
    return cleaned, None


def _flush_batch(db: Session, batch: list[dict]) -> tuple[int, int]:
    """Insert a batch idempotently. Returns (imported_count, skipped_existing_count)."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.models import Episode
    stmt = (
        pg_insert(Episode)
        .values(batch)
        .on_conflict_do_nothing(index_elements=["episode_id"])
        .returning(Episode.id)
    )
    result = db.execute(stmt)
    inserted = len(result.scalars().all())
    db.commit()
    skipped_existing = len(batch) - inserted
    return inserted, skipped_existing


def import_csv(db: Session, fileobj) -> dict:
    reader = csv.DictReader(fileobj)
    total_rows = 0
    imported = 0
    skipped_duplicate_in_file = 0
    skipped_existing = 0
    rejected = []
    seen_ids: set[str] = set()
    batch: list[dict] = []

    def flush():
        nonlocal imported, skipped_existing
        if not batch:
            return
        i, s = _flush_batch(db, batch)
        imported += i
        skipped_existing += s
        batch.clear()

    for row_num, row in enumerate(reader, start=2):  # row 1 = header
        if not any((v or '').strip() for v in row.values()):
            continue
        total_rows += 1
        cleaned, reason = _parse_row(row)
        if reason == "__blank_row__":
            # All fields empty/whitespace after normalisation: skip silently,
            # not counted as rejected or imported.
            total_rows -= 1
            continue
        if reason:
            rejected.append({"row": row_num, "reason": reason})
            continue
        episode_id = cleaned["episode_id"]
        if episode_id in seen_ids:
            skipped_duplicate_in_file += 1
            continue
        seen_ids.add(episode_id)
        batch.append(cleaned)
        if len(batch) >= BATCH_SIZE:
            flush()

    flush()  # remaining rows

    return {
        "total_rows": total_rows,
        "imported": imported,
        "skipped_duplicate_in_file": skipped_duplicate_in_file,
        "skipped_existing": skipped_existing,
        "rejected": rejected,
    }
