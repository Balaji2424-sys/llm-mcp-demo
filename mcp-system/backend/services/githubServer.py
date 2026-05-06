import json
import os
import sys
from github import Github


def load_payload() -> dict:
    if len(sys.argv) < 2:
        raise ValueError("Missing JSON payload")
    return json.loads(sys.argv[1])


def create_repository(repo_name: str) -> str:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if not token:
        raise RuntimeError("GITHUB_TOKEN is not set")
    if not repo_name:
        raise RuntimeError("Repository name is missing")

    gh = Github(token)
    user = gh.get_user()

    try:
        existing = user.get_repo(repo_name)
        return f"Repository already exists: {existing.html_url}"
    except Exception:
        pass

    repo = user.create_repo(name=repo_name, private=False, auto_init=True)
    return f"Created repository: {repo.html_url}"


def main() -> None:
    try:
        payload = load_payload()
        repo_name = str(payload.get("repo", "")).strip()
        result = create_repository(repo_name)
        print(result)
    except Exception as exc:
        print(f"GitHub service error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
