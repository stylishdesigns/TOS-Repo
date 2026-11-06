#!/usr/bin/env python3
"""Create the composite Firestore indexes from firestore.indexes.json on a named
Firestore database. Cloud Shell only:

    git clone https://github.com/stylishdesigns/TOS-Repo.git
    cd TOS-Repo
    python3 scripts/deploy-indexes.py excellence-tutorial-b20f7 ai-studio-excellencetutori-8f17639e-56a5-4f6b-8031-016b3f70cf68

Creates index definitions only; it never reads or writes collection data.
Existing indexes are skipped (409 = already exists). Builds run in the
background after creation.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

if len(sys.argv) != 3:
    print(__doc__)
    sys.exit(2)

project, db = sys.argv[1], sys.argv[2]
with open("firestore.indexes.json") as f:
    spec = json.load(f)

token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
base = f"https://firestore.googleapis.com/v1/projects/{project}/databases/{db}"

created = existed = failed = 0
for idx in spec["indexes"]:
    col = idx["collectionGroup"]
    body = {"queryScope": idx.get("queryScope", "COLLECTION"), "fields": idx["fields"]}
    req = urllib.request.Request(
        f"{base}/collectionGroups/{col}/indexes",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
        created += 1
        print(f"created   {col} ({len(idx['fields'])} fields)")
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:200]
        if e.code == 409:
            existed += 1
            print(f"already   {col} ({len(idx['fields'])} fields)")
        else:
            failed += 1
            print(f"FAILED    {col}: {e.code} {detail}")

print(f"done: {created} created, {existed} already existed, {failed} failed, of {len(spec['indexes'])} total")
sys.exit(1 if failed else 0)
