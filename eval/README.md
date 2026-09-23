# Extraction eval working directory

Drop the documents you have already keyed in by hand here, alongside a
`ground-truth.json` describing what a human recorded for each one.

**Nothing in this directory is committed.** Real compliance documents contain
driver PII — CDL numbers, addresses, medical certificates. `.gitignore` excludes
everything here except this README and the example manifest. Keep it that way.

    mkdir -p documents
    cp ground-truth.example.json ground-truth.json
    # put the matching files in documents/
    npm run eval:docs

See `docs/DOCUMENT_EXTRACTION_EVAL.md` for what the output means.
