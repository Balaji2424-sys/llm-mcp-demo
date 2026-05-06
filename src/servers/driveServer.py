import os
import sys
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.http import MediaFileUpload

SCOPES = ['https://www.googleapis.com/auth/drive']


# ---------------- AUTH ---------------- #
def authenticate():
    creds = None

    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return creds


# ---------------- CORE FUNCTIONS ---------------- #

def create_folder(service, name, parent_id=None):
    metadata = {
        'name': name,
        'mimeType': 'application/vnd.google-apps.folder'
    }

    if parent_id:
        metadata['parents'] = [parent_id]

    folder = service.files().create(body=metadata).execute()
    print(f"Created folder: {name} (ID: {folder['id']})")
    return folder['id']


def create_multiple_folders(service, names):
    for name in names:
        create_folder(service, name.strip())


def create_nested_folders(service, path):
    """
    Example input:
    parent/child/subchild
    """
    folders = path.split("/")
    parent_id = None

    for folder in folders:
        parent_id = create_folder(service, folder.strip(), parent_id)


def list_files(service):
    results = service.files().list(
        pageSize=10,
        fields="files(id, name)"
    ).execute()

    items = results.get('files', [])

    if not items:
        print("No files found.")
        return

    print("\nFiles in your Drive:\n")
    for item in items:
        print(f"{item['name']} ({item['id']})")


def upload_file(service, file_path):
    if not os.path.exists(file_path):
        print("File not found.")
        return

    file_name = os.path.basename(file_path)

    media = MediaFileUpload(file_path, resumable=True)

    file = service.files().create(
        body={'name': file_name},
        media_body=media
    ).execute()

    print(f"Uploaded file: {file_name} (ID: {file['id']})")


# ---------------- QUERY HANDLER ---------------- #

def handle_query(service, query):
    query = query.lower()

    # CREATE MULTIPLE FOLDERS
    if "create" in query and "folder" in query and "," in query:
        names = query.split("folder")[-1].strip().split(",")
        create_multiple_folders(service, names)

    # CREATE SINGLE FOLDER
    elif "create" in query and "folder" in query:
        name = query.split("folder")[-1].strip()
        create_folder(service, name)

    # NESTED FOLDERS
    elif "nested" in query:
        path = query.split("nested")[-1].strip()
        create_nested_folders(service, path)

    # LIST FILES
    elif "list" in query:
        list_files(service)

    # UPLOAD FILE
    elif "upload" in query:
        file_path = query.split("upload")[-1].strip()
        upload_file(service, file_path)

    else:
        print("Unsupported Drive operation")


# ---------------- MAIN ---------------- #

def main():
    query = " ".join(sys.argv[1:])

    if not query:
        print("No query provided")
        return

    creds = authenticate()
    service = build('drive', 'v3', credentials=creds)

    handle_query(service, query)


if __name__ == "__main__":
    main()