#!/usr/bin/env python3.11
"""
Decrypt secrets.enc and inject secrets into the environment, then start the app.

On correct password:
  - Decrypts secrets.enc and injects all key=value pairs into os.environ.
  - Execs the startup command so the child process inherits the env vars.

On wrong password:
  - Prints "Incorrect password. Exiting." and exits with code 1.

Password source (in priority order):
  1. DECRYPT_PASSWORD environment variable (for non-interactive / workflow use)
  2. Interactive terminal prompt via getpass

Startup command (DECRYPT_RUN_CMD env var or default):
  node scripts/dev-ctl.mjs start all
"""
import os
import json
import base64
import struct
import sys
import getpass
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.fernet import Fernet, InvalidToken

_DEFAULT_CMD = ["node", "scripts/dev-ctl.mjs", "start", "all"]


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def main():
    secrets_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secrets.enc")

    if not os.path.exists(secrets_file):
        print("Error: secrets.enc not found. Run encrypt_secrets.py first.")
        sys.exit(1)

    password = os.environ.get("DECRYPT_PASSWORD")
    if not password:
        password = getpass.getpass("Enter Decryption Password: ")

    with open(secrets_file, "rb") as fh:
        data = fh.read()

    salt_len = struct.unpack(">H", data[:2])[0]
    salt = data[2:2 + salt_len]
    ciphertext = data[2 + salt_len:]

    key = derive_key(password, salt)
    f = Fernet(key)

    try:
        plaintext = f.decrypt(ciphertext)
    except InvalidToken:
        print("Incorrect password. Exiting.")
        sys.exit(1)

    secrets = json.loads(plaintext.decode())
    os.environ.update(secrets)

    raw_cmd = os.environ.get("DECRYPT_RUN_CMD", "")
    if raw_cmd:
        args = raw_cmd.split()
    else:
        args = _DEFAULT_CMD

    os.execvp(args[0], args)


if __name__ == "__main__":
    main()
