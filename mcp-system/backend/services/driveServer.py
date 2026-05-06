import json
import os
import re
import sys
import tempfile

from typing import List, Tuple

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# ========================================
# CONFIG
# ========================================

SCOPES = [
    "https://www.googleapis.com/auth/drive"
]

ROOT_DIR = os.path.abspath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        ".."
    )
)

# ========================================
# HELPERS
# ========================================

def resolve_existing_path(
    candidates: List[str],
    label: str
) -> str:

    for path in candidates:

        if path and os.path.exists(path):

            return path

    raise FileNotFoundError(
        f"{label} not found. Checked: {', '.join(candidates)}"
    )

# ========================================
# RESOLVE AUTH FILES
# ========================================

def resolve_paths() -> Tuple[str, str]:

    env_credentials_path = os.getenv(
        "GOOGLE_CREDENTIALS_PATH",
        ""
    ).strip()

    env_token_path = os.getenv(
        "GOOGLE_TOKEN_PATH",
        ""
    ).strip()

    env_credentials_json = os.getenv(
        "GOOGLE_CREDENTIALS_JSON",
        ""
    ).strip()

    env_token_json = os.getenv(
        "GOOGLE_TOKEN_JSON",
        ""
    ).strip()

    cwd = os.getcwd()

    parent_of_root = os.path.abspath(
        os.path.join(ROOT_DIR, "..")
    )

    # ====================================
    # GOOGLE_CREDENTIALS_JSON SUPPORT
    # ====================================

    if env_credentials_json:

        credentials_temp = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".json"
        )

        credentials_temp.write(
            env_credentials_json.encode("utf-8")
        )

        credentials_temp.close()

        credentials_path = credentials_temp.name

        print(
            "Using credentials from GOOGLE_CREDENTIALS_JSON env"
        )

    else:

        credentials_candidates = [

            env_credentials_path,

            os.path.join(
                ROOT_DIR,
                "credentials.json"
            ),

            os.path.join(
                cwd,
                "credentials.json"
            ),

            os.path.join(
                parent_of_root,
                "credentials.json"
            ),
        ]

        credentials_path = resolve_existing_path(
            credentials_candidates,
            "Google credentials.json"
        )

    # ====================================
    # GOOGLE_TOKEN_JSON SUPPORT
    # ====================================

    if env_token_json:

        token_temp = tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".json"
        )

        token_temp.write(
            env_token_json.encode("utf-8")
        )

        token_temp.close()

        token_path = token_temp.name

        print(
            "Using token from GOOGLE_TOKEN_JSON env"
        )

        return credentials_path, token_path

    # ====================================
    # TOKEN FILE FALLBACK
    # ====================================

    token_candidates = [

        env_token_path,

        os.path.join(
            ROOT_DIR,
            "token.json"
        ),

        os.path.join(
            cwd,
            "token.json"
        ),

        os.path.join(
            parent_of_root,
            "token.json"
        ),
    ]

    token_path = ""

    for path in token_candidates:

        if path and os.path.exists(path):

            token_path = path

            break

    # fallback token path

    if not token_path:

        token_path = token_candidates[1]

    return credentials_path, token_path

# ========================================
# GOOGLE AUTH
# ========================================

def authenticate():

    creds = None

    credentials_path, token_path = resolve_paths()

    # ====================================
    # EXISTING TOKEN
    # ====================================

    if os.path.exists(token_path):

        creds = Credentials.from_authorized_user_file(
            token_path,
            SCOPES
        )

    # ====================================
    # REFRESH / LOGIN
    # ====================================

    if not creds or not creds.valid:

        if creds and creds.expired and creds.refresh_token:

            print(
                "Refreshing expired Google token..."
            )

            creds.refresh(Request())

        else:

            print(
                "Running Google OAuth flow..."
            )

            flow = InstalledAppFlow.from_client_secrets_file(
                credentials_path,
                SCOPES
            )

            creds = flow.run_local_server(
                port=0
            )

        # save token

        with open(
            token_path,
            "w",
            encoding="utf-8"
        ) as token_file:

            token_file.write(
                creds.to_json()
            )

    return creds

# ========================================
# CREATE SINGLE FOLDER
# ========================================

def create_folder(
    service,
    name: str,
    parent_id: str = None
) -> str:

    metadata = {

        "name": name,

        "mimeType":
            "application/vnd.google-apps.folder",
    }

    if parent_id:

        metadata["parents"] = [parent_id]

    folder = service.files().create(

        body=metadata,

        fields="id,name"

    ).execute()

    return folder["id"]

# ========================================
# TEXT HELPERS
# ========================================

def normalize_folder_list(
    text: str
) -> List[str]:

    return [

        item.strip()

        for item in text.split(",")

        if item.strip()
    ]

# ========================================
# PARSE DRIVE QUERY
# ========================================

def parse_drive_folders(
    raw_query: str,
    parent_from_llm: str,
    folders_from_llm: List[str]
) -> Tuple[str, List[str]]:

    query = raw_query.strip()

    marker = re.search(
        r"drive\s+folder[s]?\s+",
        query,
        flags=re.IGNORECASE
    )

    if marker:

        tail = query[
            marker.end():
        ].strip()

    else:

        tail = ""

    # ====================================
    # PARENT/CHILD FORMAT
    # Example:
    # STUDENTS/A,B,C
    # ====================================

    if tail and "/" in tail:

        left, right = tail.split("/", 1)

        parent = left.strip()

        children = normalize_folder_list(right)

        return parent, children

    # ====================================
    # LLM FALLBACK
    # ====================================

    if parent_from_llm and folders_from_llm:

        return (

            parent_from_llm.strip(),

            [
                f.strip()

                for f in folders_from_llm

                if str(f).strip()
            ]
        )

    # ====================================
    # SIMPLE FOLDER LIST
    # ====================================

    if tail:

        return "", normalize_folder_list(tail)

    return (

        "",

        [
            str(f).strip()

            for f in folders_from_llm

            if str(f).strip()
        ]
    )

# ========================================
# CREATE MULTIPLE FOLDERS
# ========================================

def create_multiple_folders(
    service,
    parent_name: str,
    folders: List[str]
) -> List[str]:

    created_messages = []

    parent_id = None

    # ====================================
    # CREATE PARENT
    # ====================================

    if parent_name:

        parent_id = create_folder(
            service,
            parent_name
        )

        created_messages.append(
            f"Created parent folder: {parent_name}"
        )

    # ====================================
    # CREATE CHILDREN
    # ====================================

    for folder_name in folders:

        create_folder(
            service,
            folder_name,
            parent_id
        )

        if parent_name:

            created_messages.append(
                f"Created child folder: {parent_name}/{folder_name}"
            )

        else:

            created_messages.append(
                f"Created folder: {folder_name}"
            )

    return created_messages

# ========================================
# HANDLE QUERY
# ========================================

def handle_query(
    service,
    payload: dict
) -> List[str]:

    parent_from_llm = str(
        payload.get(
            "parent_folder",
            ""
        )
    )

    folders_from_llm = payload.get(
        "folders",
        []
    )

    raw_query = str(
        payload.get(
            "raw_query",
            ""
        )
    )

    parent, folders = parse_drive_folders(

        raw_query,

        parent_from_llm,

        folders_from_llm
    )

    if not folders:

        raise RuntimeError(
            "No drive folders detected in request"
        )

    return create_multiple_folders(
        service,
        parent,
        folders
    )

# ========================================
# MAIN
# ========================================

def main() -> None:

    try:

        if len(sys.argv) < 2:

            raise ValueError(
                "Missing JSON payload"
            )

        payload = json.loads(
            sys.argv[1]
        )

        creds = authenticate()

        service = build(
            "drive",
            "v3",
            credentials=creds
        )

        messages = handle_query(
            service,
            payload
        )

        print(
            "\n".join(messages)
        )

    except Exception as exc:

        print(
            f"Drive service error: {exc}",
            file=sys.stderr
        )

        sys.exit(1)

# ========================================
# ENTRY
# ========================================

if __name__ == "__main__":

    main()
