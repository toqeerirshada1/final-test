#!/usr/bin/env python3.11
"""
Encrypt secrets into secrets.enc using PBKDF2-derived Fernet (AES-128-CBC + HMAC).

Usage:
  Set each secret as an environment variable, then run:
    python3.11 encrypt_secrets.py

Required environment variables:
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL,
  JWT_SECRET, ADMIN_JWT_SECRET, ADMIN_CSRF_SECRET,
  ERROR_REPORT_HMAC_SECRET, PORT

The password is prompted interactively (hidden input).
Output: secrets.enc (binary, safe to commit to git).
"""
import os
import sys
import json
import base64
import struct
import getpass
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.fernet import Fernet

SECRET_KEYS = [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_CONTACT_EMAIL",
    "JWT_SECRET",
    "ADMIN_JWT_SECRET",
    "ADMIN_CSRF_SECRET",
    "ERROR_REPORT_HMAC_SECRET",
    "PORT",
]


def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def main():
    secrets = {}
    missing = []
    for key in SECRET_KEYS:
        value = os.environ.get(key)
        if value:
            secrets[key] = value
        else:
            missing.append(key)

    if missing:
        print("Error: the following required env vars are not set:")
        for k in missing:
            print(f"  {k}")
        print("\nSet all required env vars before running encrypt_secrets.py.")
        sys.exit(1)

    password = getpass.getpass("Enter Encryption Password: ")
    if not password:
        print("Error: password cannot be empty.")
        sys.exit(1)

    salt = os.urandom(16)
    key = derive_key(password, salt)
    f = Fernet(key)

    plaintext = json.dumps(secrets).encode()
    ciphertext = f.encrypt(plaintext)

    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "secrets.enc")
    salt_len = struct.pack(">H", len(salt))
    with open(output_path, "wb") as fh:
        fh.write(salt_len)
        fh.write(salt)
        fh.write(ciphertext)

    print(f"secrets.enc written successfully ({len(secrets)} secrets encrypted).")


if __name__ == "__main__":
    main()
