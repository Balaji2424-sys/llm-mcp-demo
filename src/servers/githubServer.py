import os
import sys
import requests
from github import Github, Auth

token = os.getenv("GITHUB_TOKEN")

if not token or token.startswith("ghp_xxxxxx"):
    print("Error: GITHUB_TOKEN is not set or is still a placeholder")
    sys.exit(1)

# Use the new authentication method
auth = Auth.Token(token)
g = Github(auth=auth)

# Debug: Test authentication
try:
    username = g.get_user().login
    print(f"Authenticated as: {username}")
except Exception as e:
    print(f"Authentication error: {e}")
    sys.exit(1)

query = " ".join(sys.argv[1:])

if "create" in query and "repo" in query:
    repo_name = query.split()[-1]
    
    print(f"DEBUG: Attempting to create repo: {repo_name}")
    
    try:
        # Use REST API directly instead of PyGithub method
        headers = {
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
        
        data = {
            "name": repo_name,
            "description": "Created via MCP server",
            "private": False
        }
        
        response = requests.post(
            "https://api.github.com/user/repos",
            headers=headers,
            json=data
        )
        
        if response.status_code == 201:
            repo_data = response.json()
            print(f"Repository created: {repo_data['html_url']}")
        else:
            print(f"Error creating repository: Status {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error creating repository: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

elif "list" in query:
    repos = g.get_user().get_repos()
    for repo in repos:
        print(repo.name)

else:
    print("Unsupported GitHub operation")