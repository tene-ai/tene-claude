import jwt
def require_user(token: str):
    return jwt.decode(token, verify=True)
