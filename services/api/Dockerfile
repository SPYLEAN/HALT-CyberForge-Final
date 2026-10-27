FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

RUN useradd --create-home --uid 10001 halt
COPY pyproject.toml ./
COPY halt ./halt
RUN pip install --no-cache-dir .

USER halt
EXPOSE 8000
CMD ["uvicorn", "halt.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
