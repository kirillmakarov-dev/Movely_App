"""Import or verify the complete official PIBA locality snapshot (standard library only)."""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

RESOURCE_ID = "8f714b6f-c35c-4b40-a0e7-547b675eee0e"
DATASET_URL = "https://data.gov.il/he/datasets/population_authority/citiesandsettelments"
METADATA_URL = "https://data.gov.il/api/3/action/package_show?id=citiesandsettelments"
SOURCE_URL = f"https://data.gov.il/api/3/action/datastore_search?resource_id={RESOURCE_ID}&limit=10000"
LICENSE_URL = "https://data.gov.il/he/terms-of-use"
DEFAULT_DIRECTORY = Path(__file__).resolve().parents[1] / "apps/api/src/Movely.Api/Modules/Localities/Data"


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def sha256(value):
    return hashlib.sha256(value).hexdigest()


def download(url):
    request = Request(url, headers={"User-Agent": "Movely-locality-import/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError(f"Unexpected HTTP status: {response.status}")
        data = response.read(5_000_001)
        if len(data) > 5_000_000:
            raise ValueError("Source exceeds the reviewed size limit.")
        return data


def build_catalog(source):
    payload = json.loads(source)
    if payload.get("success") is not True:
        raise ValueError("The government API did not report success.")
    result = payload["result"]
    schema = {field["id"]: field["type"] for field in result["fields"]}
    if any(schema.get(name) != kind for name, kind in {
        "city_code": "numeric", "city_name_he": "text", "city_name_en": "text"
    }.items()):
        raise ValueError("The official schema changed; review it before importing.")
    records = result["records"]
    if len(records) != result["total"] or not 1000 <= len(records) <= 10000:
        raise ValueError("Incomplete or unexpectedly sized locality snapshot.")
    catalog = []
    codes = set()
    for record in records:
        code = record["city_code"]
        if isinstance(code, bool) or not isinstance(code, int) or not 1 <= code <= 2_147_483_647:
            # The reviewed snapshot has no unknown/no-settlement sentinel. A new one
            # must be reviewed explicitly; do not silently discard a real community.
            raise ValueError(f"Unreviewed locality code/sentinel: {code!r}")
        if code in codes:
            raise ValueError(f"Duplicate locality code: {code}")
        codes.add(code)
        name = record["city_name_he"]
        alias = record["city_name_en"]
        if not isinstance(name, str) or not name.strip() or len(name) > 120:
            raise ValueError(f"Missing or invalid Hebrew name for {code}.")
        if not isinstance(alias, str) or len(alias) > 120:
            raise ValueError(f"Invalid English alias for {code}.")
        if any(ord(char) < 32 for char in name + alias):
            raise ValueError(f"Control character in official name for {code}.")
        catalog.append({"code": str(code), "name": name.strip(), "aliases": [alias.strip()] if alias.strip() else []})
    catalog.sort(key=lambda locality: int(locality["code"]))
    return catalog


def verify(manifest_path):
    manifest = json.loads(manifest_path.read_bytes())
    directory = manifest_path.parent
    source = (directory / manifest["sourceFile"]).read_bytes()
    catalog_bytes = (directory / manifest["catalogFile"]).read_bytes()
    if sha256(source) != manifest["sourceSha256"] or sha256(catalog_bytes) != manifest["catalogSha256"]:
        raise ValueError("Snapshot checksum mismatch.")
    catalog = build_catalog(source)
    if encode(catalog) != catalog_bytes or len(catalog) != manifest["localityCount"]:
        raise ValueError("Catalog is not the deterministic projection of the archived official source.")
    print(f"Verified {manifest['snapshotVersion']}: {len(catalog)} localities; catalog SHA256 {sha256(catalog_bytes)}")


def refresh(directory):
    metadata_before = json.loads(download(METADATA_URL))["result"]
    if metadata_before.get("license_id") != "other-open" or metadata_before.get("license_url"):
        raise ValueError("Source license metadata changed; review the applicable license first.")
    resource = next(item for item in metadata_before["resources"] if item["id"] == RESOURCE_ID)
    source = download(SOURCE_URL)
    metadata_after = json.loads(download(METADATA_URL))["result"]
    if metadata_before["metadata_modified"] != metadata_after["metadata_modified"]:
        raise ValueError("Source metadata changed during download; retry without mixing snapshots.")
    catalog = build_catalog(source)
    modified = resource["last_modified"]
    try:
        version = datetime.strptime(modified, "%d/%m/%Y %H:%M:%S").date().isoformat()
    except ValueError:
        version = datetime.fromisoformat(modified.replace("Z", "+00:00")).date().isoformat()
    prefix = f"localities.piba.{version}"
    catalog_bytes = encode(catalog)
    manifest = {
        "schemaVersion": 1,
        "snapshotVersion": version,
        "publisher": "Population and Immigration Authority, State of Israel",
        "datasetUrl": DATASET_URL,
        "metadataUrl": METADATA_URL,
        "resourceId": RESOURCE_ID,
        "sourceUrl": SOURCE_URL,
        "resourceDownloadUrl": resource["url"],
        "sourceLastModified": modified,
        "datasetLastModified": metadata_before["metadata_modified"],
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "licenseId": metadata_before["license_id"],
        "licenseUrl": LICENSE_URL,
        "licensePageUpdated": "2025-08-30",
        "sourceFile": f"{prefix}.source.json",
        "catalogFile": f"{prefix}.json",
        "sourceSha256": sha256(source),
        "catalogSha256": sha256(catalog_bytes),
        "sourceRowCount": len(catalog),
        "localityCount": len(catalog),
        "excludedRecords": [],
    }
    # All validation completes before creating any output. A same-version import
    # never silently replaces a reviewed snapshot.
    output = {
        manifest["sourceFile"]: source,
        manifest["catalogFile"]: catalog_bytes,
        f"{prefix}.manifest.json": encode(manifest),
    }
    if any((directory / name).exists() for name in output):
        raise ValueError("Snapshot version already exists. Import to a temporary directory and review its diff.")
    directory.mkdir(parents=True, exist_ok=True)
    for name, contents in output.items():
        (directory / name).write_bytes(contents)
    verify(directory / f"{prefix}.manifest.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Explicitly fetch a new complete official snapshot.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_DIRECTORY)
    args = parser.parse_args()
    if args.refresh:
        refresh(args.output_dir)
    else:
        manifests = sorted(args.output_dir.glob("localities.piba.*.manifest.json"))
        if not manifests:
            raise ValueError("No local snapshot manifests found.")
        for manifest_path in manifests:
            verify(manifest_path)


if __name__ == "__main__":
    main()
