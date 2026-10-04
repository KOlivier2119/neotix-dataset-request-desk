.PHONY: test up down

# Run the full backend test suite against the compose Postgres.
test:
	docker compose up -d db
	docker compose exec -T db psql -U desk -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='desk_test'" | grep -q 1 || docker compose exec -T db psql -U desk -d postgres -c "CREATE DATABASE desk_test"
	docker compose run --rm --no-deps -e TEST_DATABASE_URL=postgresql+psycopg://desk:desk@db:5432/desk_test api python -m pytest tests/ -v

up:
	docker compose up --build

down:
	docker compose down -v
