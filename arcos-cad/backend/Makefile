.PHONY: launch-server migrate shell test

PYTHON = .venv/Scripts/python.exe

launch-server:
	$(PYTHON) manage.py makemigrations
	$(PYTHON) manage.py migrate
	$(PYTHON) manage.py runserver 0.0.0.0:8000

migrate:
	$(PYTHON) manage.py makemigrations
	$(PYTHON) manage.py migrate

shell:
	$(PYTHON) manage.py shell

test:
	$(PYTHON) manage.py test
