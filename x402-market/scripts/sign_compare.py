from eth_account import Account
import json

# Test Vector
PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
MOCK_USDC = '0x865310dc9D0bFE1460caB221B4bF3DA2040b94D7'
PAY_TO = '0x8d4712191fa0a189ab95C58aBaF6E19EBEA74c7f'
NONCE_HEX = '0x0000000000000000000000000000000000000000000000000000000000000001'
NONCE_BYTES = bytes.fromhex(NONCE_HEX[2:])
AMOUNT = 5000000000000000000 # 5 * 1e18
VALID_AFTER = 0
VALID_BEFORE = 2000000000

def main():
    account = Account.from_key(PRIVATE_KEY)
    print("Address:", account.address)

    domain = {
        "name": "Mock USD Coin",
        "version": "1",
        "chainId": 71,
        "verifyingContract": MOCK_USDC
    }

    types = {
        "ReceiveWithAuthorization": [
            {"name": "from", "type": "address"},
            {"name": "to", "type": "address"},
            {"name": "value", "type": "uint256"},
            {"name": "validAfter", "type": "uint256"},
            {"name": "validBefore", "type": "uint256"},
            {"name": "nonce", "type": "bytes32"}
        ]
    }

    # Test 1: Nonce as bytes (Standard expectation)
    message_bytes = {
        "from": account.address,
        "to": PAY_TO,
        "value": AMOUNT,
        "validAfter": VALID_AFTER,
        "validBefore": VALID_BEFORE,
        "nonce": NONCE_BYTES
    }
    
    # Test 2: Nonce as hex string (Like JS)
    message_hex = {
        "from": account.address,
        "to": PAY_TO,
        "value": AMOUNT,
        "validAfter": VALID_AFTER,
        "validBefore": VALID_BEFORE,
        "nonce": NONCE_BYTES # ethers.js usually treats hex string as bytes for bytes32
    }

    typed_data = {
        "types": types,
        "primaryType": "ReceiveWithAuthorization",
        "domain": domain,
        "message": message_bytes
    }

    signed = account.sign_typed_data(full_message=typed_data)

    print("Signature (Nonce Bytes):")
    print("v:", signed.v)
    print("r:", hex(signed.r))
    print("s:", hex(signed.s))

if __name__ == "__main__":
    main()
