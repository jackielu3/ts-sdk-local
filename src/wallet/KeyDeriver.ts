import {
  PrivateKey,
  PublicKey,
  SymmetricKey,
  Hash,
  Utils
} from '../primitives/index'
import { WalletProtocol, PubKeyHex } from './Wallet.interfaces'

export type Counterparty = PublicKey | PubKeyHex | 'self' | 'anyone'

export interface KeyDeriverApi {
  /**
   * The root key from which all other keys are derived.
   */
  rootKey: PrivateKey

  /**
   * The identity of this key deriver which is normally the public key associated with the `rootKey`
   */
  identityKey: string

  /**
   * Derives a public key based on protocol ID, key ID, and counterparty.
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @param {boolean} [forSelf=false] - Optional. false if undefined. Whether deriving for self.
   * @returns {PublicKey} - The derived public key.
   */
  derivePublicKey: (
    protocolID: WalletProtocol,
    keyID: string,
    counterparty: Counterparty,
    forSelf?: boolean
  ) => PublicKey

  /**
   * Derives a private key based on protocol ID, key ID, and counterparty.
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @returns {PrivateKey} - The derived private key.
   */
  derivePrivateKey: (
    protocolID: WalletProtocol,
    keyID: string,
    counterparty: Counterparty
  ) => PrivateKey

  /**
   * Derives a symmetric key based on protocol ID, key ID, and counterparty.
   * Note: Symmetric keys should not be derivable by everyone due to security risks.
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @returns {SymmetricKey} - The derived symmetric key.
   */
  deriveSymmetricKey: (
    protocolID: WalletProtocol,
    keyID: string,
    counterparty: Counterparty
  ) => SymmetricKey

  /**
   * Reveals the shared secret between the root key and the counterparty.
   * Note: This should not be used for 'self'.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @returns {number[]} - The shared secret as a number array.
   * @throws {Error} - Throws an error if attempting to reveal a shared secret for 'self'.
   */
  revealCounterpartySecret: (counterparty: Counterparty) => number[]

  /**
   * Reveals the specific key association for a given protocol ID, key ID, and counterparty.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @returns {number[]} - The specific key association as a number array.
   */
  revealSpecificSecret: (
    counterparty: Counterparty,
    protocolID: WalletProtocol,
    keyID: string
  ) => number[]
}

/**
 * Class responsible for deriving various types of keys using a root private key.
 * It supports deriving public and private keys, symmetric keys, and revealing key linkages.
 */
export class KeyDeriver implements KeyDeriverApi {
  rootKey: PrivateKey
  identityKey: string

  /**
   * Initializes the KeyDeriver instance with a root private key.
   * @param {PrivateKey | 'anyone'} rootKey - The root private key or the string 'anyone'.
   */
  constructor (rootKey: PrivateKey | 'anyone') {
    if (rootKey === 'anyone') {
      this.rootKey = new PrivateKey(1)
    } else {
      this.rootKey = rootKey
    }
    this.identityKey = this.rootKey.toPublicKey().toString()
  }

  /**
 * Derives a public key based on protocol ID, key ID, and counterparty.
 * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
 * @param {string} keyID - The key identifier.
 * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
 * @param {boolean} [forSelf=false] - Whether deriving for self.
 * @returns {PublicKey} - The derived public key.
 */
  derivePublicKey (
    protocolID: WalletProtocol,
    keyID: string,
    counterparty: Counterparty,
    forSelf: boolean = false
  ): PublicKey {
    console.log('🔍 [DEBUG] Entering derivePublicKey')
    console.log('Protocol ID:', protocolID)
    console.log('Key ID:', keyID)
    console.log('Counterparty before normalization:', counterparty)

    try {
      counterparty = this.normalizeCounterparty(counterparty)
      console.log('✅ [DEBUG] Normalized Counterparty:', counterparty.toString())
    } catch (error) {
      console.error('❌ [ERROR] normalizeCounterparty() failed:', error)
      throw new Error('derivePublicKey() failed due to invalid counterparty')
    }

    let derivedKey: PublicKey

    if (forSelf) {
      console.log('🔍 [DEBUG] Deriving key for self...')
      derivedKey = this.rootKey
        .deriveChild(counterparty, this.computeInvoiceNumber(protocolID, keyID))
        .toPublicKey()
    } else {
      console.log('🔍 [DEBUG] Deriving key for counterparty...')
      derivedKey = counterparty.deriveChild(
        this.rootKey,
        this.computeInvoiceNumber(protocolID, keyID)
      )
    }

    // ✅ Validate the derived key before returning
    if (!derivedKey.validate()) {
      console.error('❌ [DEBUG] Invalid derived public key:', derivedKey.toString())
      throw new Error('derivePublicKey() generated an invalid key')
    }

    console.log('✅ [DEBUG] Successfully derived public key:', derivedKey.toString())
    return derivedKey
  }

  /**
   * Derives a private key based on protocol ID, key ID, and counterparty.
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @returns {PrivateKey} - The derived private key.
   */
  derivePrivateKey (
    protocolID: WalletProtocol,
    keyID: string,
    counterparty: Counterparty
  ): PrivateKey {
    counterparty = this.normalizeCounterparty(counterparty)
    return this.rootKey.deriveChild(
      counterparty,
      this.computeInvoiceNumber(protocolID, keyID)
    )
  }

  /**
   * Derives a symmetric key based on protocol ID, key ID, and counterparty.
   * Note: Symmetric keys should not be derivable by everyone due to security risks.
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @returns {SymmetricKey} - The derived symmetric key.
   */
  deriveSymmetricKey (
    protocolID: WalletProtocol,
    keyID: string,
    counterparty: Counterparty
  ): SymmetricKey {
    // If counterparty is 'anyone', we use 1*G as the public key.
    // This is a publicly derivable key and should only be used in scenarios where public disclosure is intended.
    if (counterparty === 'anyone') {
      counterparty = new PrivateKey(1).toPublicKey()
    }
    counterparty = this.normalizeCounterparty(counterparty)
    const derivedPublicKey = this.derivePublicKey(
      protocolID,
      keyID,
      counterparty
    )
    const derivedPrivateKey = this.derivePrivateKey(
      protocolID,
      keyID,
      counterparty
    )

    const sharedSecret = derivedPrivateKey.deriveSharedSecret(derivedPublicKey)
    if (sharedSecret.x == null) {
      throw new Error('Failed to derive shared secret: x-coordinate is null')
    }

    return new SymmetricKey(sharedSecret.x.toArray())
  }

  /**
   * Reveals the shared secret between the root key and the counterparty.
   * Note: This should not be used for 'self'.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @returns {number[]} - The shared secret as a number array.
   * @throws {Error} - Throws an error if attempting to reveal a shared secret for 'self'.
   */
  revealCounterpartySecret (counterparty: Counterparty): number[] {
    if (counterparty === 'self') {
      throw new Error(
        'Counterparty secrets cannot be revealed for counterparty=self.'
      )
    }
    counterparty = this.normalizeCounterparty(counterparty)

    // Double-check to ensure not revealing the secret for 'self'
    const self = this.rootKey.toPublicKey()
    const keyDerivedBySelf = this.rootKey.deriveChild(self, 'test').toHex()
    const keyDerivedByCounterparty = this.rootKey
      .deriveChild(counterparty, 'test')
      .toHex()

    if (keyDerivedBySelf === keyDerivedByCounterparty) {
      throw new Error(
        'Counterparty secrets cannot be revealed for counterparty=self.'
      )
    }

    return this.rootKey
      .deriveSharedSecret(counterparty)
      .encode(true) as number[]
  }

  /**
   * Reveals the specific key association for a given protocol ID, key ID, and counterparty.
   * @param {Counterparty} counterparty - The counterparty's public key or a predefined value ('self' or 'anyone').
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @returns {number[]} - The specific key association as a number array.
   */
  revealSpecificSecret (
    counterparty: Counterparty,
    protocolID: WalletProtocol,
    keyID: string
  ): number[] {
    counterparty = this.normalizeCounterparty(counterparty)
    const sharedSecret = this.rootKey.deriveSharedSecret(counterparty)
    const invoiceNumberBin = Utils.toArray(
      this.computeInvoiceNumber(protocolID, keyID),
      'utf8'
    )
    return Hash.sha256hmac(sharedSecret.encode(true), invoiceNumberBin)
  }

  public normalizeCounterparty (counterparty: Counterparty): PublicKey {
    console.log('🔍 [DEBUG] Normalizing counterparty:', counterparty)

    if (counterparty === undefined || counterparty === null) {
      throw new Error('Counterparty must be "self", "anyone", or a valid public key string!')
    }

    let normalizedKey: PublicKey

    if (counterparty === 'self') {
      console.log('✅ [DEBUG] Counterparty is "self", returning root key.')
      normalizedKey = this.rootKey.toPublicKey()
    } else if (counterparty === 'anyone') {
      console.log('✅ [DEBUG] Counterparty is "anyone", using fixed key.')
      normalizedKey = new PrivateKey(1).toPublicKey()
    } else if (typeof counterparty === 'string') {
      try {
        console.log('🔍 [DEBUG] Counterparty is a string, attempting to parse public key:', counterparty)
        normalizedKey = PublicKey.fromString(counterparty)

        if (!normalizedKey.validate()) {
          throw new Error('Parsed public key failed validation.')
        }
      } catch (error) {
        console.error('❌ [ERROR] Failed to parse public key from string:', counterparty, error)
        throw new Error(`Invalid public key string: ${counterparty}`)
      }
    } else {
      normalizedKey = counterparty
    }

    // ✅ Validate before returning
    if (!normalizedKey.validate()) {
      console.error('❌ [ERROR] Invalid normalized counterparty public key:', normalizedKey.toString())
      throw new Error('normalizeCounterparty() produced an invalid key')
    }

    console.log('✅ [DEBUG] Successfully normalized counterparty key:', normalizedKey.toString())
    return normalizedKey
  }

  /**
   * Computes the invoice number based on the protocol ID and key ID.
   * @param {WalletProtocol} protocolID - The protocol ID including a security level and protocol name.
   * @param {string} keyID - The key identifier.
   * @returns {string} - The computed invoice number.
   * @throws {Error} - Throws an error if protocol ID or key ID are invalid.
   */
  public computeInvoiceNumber (
    protocolID: WalletProtocol,
    keyID: string
  ): string {
    const securityLevel = protocolID[0]
    if (
      !Number.isInteger(securityLevel) ||
      securityLevel < 0 ||
      securityLevel > 2
    ) {
      throw new Error('Protocol security level must be 0, 1, or 2')
    }
    const protocolName = protocolID[1].toLowerCase().trim()
    if (keyID.length > 800) {
      throw new Error('Key IDs must be 800 characters or less')
    }
    if (keyID.length < 1) {
      throw new Error('Key IDs must be 1 character or more')
    }
    if (protocolName.length > 400) {
      // Specific linkage revelation is the only protocol ID that can contain another protocol ID.
      // Therefore, we allow it to be long enough to encapsulate the target protocol
      if (protocolName.startsWith('specific linkage revelation ')) {
        // The format is: 'specific linkage revelation x YYYYY'
        // Where: x is the security level and YYYYY is the target protocol
        // Thus, the max acceptable length is 30 + 400 = 430 bytes
        if (protocolName.length > 430) {
          throw new Error(
            'Specific linkage revelation protocol names must be 430 characters or less'
          )
        }
      } else {
        throw new Error('Protocol names must be 400 characters or less')
      }
    }
    if (protocolName.length < 5) {
      throw new Error('Protocol names must be 5 characters or more')
    }
    if (protocolName.includes('  ')) {
      throw new Error(
        'Protocol names cannot contain multiple consecutive spaces ("  ")'
      )
    }
    if (!/^[a-z0-9 ]+$/g.test(protocolName)) {
      throw new Error(
        'Protocol names can only contain letters, numbers and spaces'
      )
    }
    if (protocolName.endsWith(' protocol')) {
      throw new Error('No need to end your protocol name with " protocol"')
    }
    return `${securityLevel}-${protocolName}-${keyID}`
  }
}

export default KeyDeriver
