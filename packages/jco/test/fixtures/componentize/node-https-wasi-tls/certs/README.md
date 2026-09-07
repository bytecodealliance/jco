These certificates and the unencrypted server key are public test fixtures only.
`ca.crt` is a self-signed RSA test CA; `localhost.crt` is signed by that CA,
with SAN `DNS:localhost`, CA:FALSE, and serverAuth EKU. Both expire in 2126.
The CA private key is not stored. The fixture deliberately does not match an
IP address or `wrong.example`, and is never added to system trust.
