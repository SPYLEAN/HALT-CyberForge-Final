"""Certificate and Ed25519 signature.

certificate = sha256(canonical JSON of the proof without `certificate` and `signature`).
The signature is Ed25519 over the certificate's hex string. The key is a per-deployment DEMO key: it
proves the proof was not altered after sealing by this deployment, nothing more.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from halt.canonical import sha256_hex
from halt.contracts.proof import Proof, Signature

UNSIGNED_FIELDS = {"certificate", "signature"}


def certificate_of(proof_body: dict[str, object]) -> str:
    return sha256_hex({k: v for k, v in proof_body.items() if k not in UNSIGNED_FIELDS})


def _key_id(public: Ed25519PublicKey) -> str:
    raw = public.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return "demo-" + hashlib.sha256(raw).hexdigest()[:16]


@dataclass
class Sealer:
    private_key: Ed25519PrivateKey

    @classmethod
    def generate(cls) -> Sealer:
        return cls(Ed25519PrivateKey.generate())

    @classmethod
    def from_path(cls, path: Path) -> Sealer:
        """Load the demo key, creating it (mode 600 where supported) on first use."""
        if path.exists():
            key = serialization.load_pem_private_key(path.read_bytes(), password=None)
            if not isinstance(key, Ed25519PrivateKey):
                raise ValueError(f"{path} is not an Ed25519 key")
            return cls(key)
        key = Ed25519PrivateKey.generate()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
            )
        )
        path.chmod(0o600)
        return cls(key)

    @property
    def key_id(self) -> str:
        return _key_id(self.private_key.public_key())

    def sign(self, certificate: str) -> Signature:
        value = base64.b64encode(self.private_key.sign(certificate.encode())).decode()
        return Signature(key_id=self.key_id, value=value)

    def verify(self, proof: Proof) -> tuple[bool, bool, str]:
        """(certificate matches body, signature valid for this deployment's key, recomputed certificate)."""
        recomputed = certificate_of(proof.model_dump(mode="json"))
        cert_ok = recomputed == proof.certificate
        sig_ok = False
        if proof.signature.key_id == self.key_id:
            try:
                self.private_key.public_key().verify(
                    base64.b64decode(proof.signature.value), proof.certificate.encode()
                )
                sig_ok = True
            except (InvalidSignature, ValueError):
                sig_ok = False
        return cert_ok, sig_ok, recomputed
