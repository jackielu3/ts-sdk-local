import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { StorageUploader } from '../StorageUploader.js'
import { WalletClient, StorageUtils } from '../../../mod.js'

describe('StorageUploader Integration Tests', () => {
  let uploader: StorageUploader
  let walletClient: WalletClient
  let globalFetchSpy: any

  beforeEach(() => {
    // Use real WalletClient
    const client = new WalletClient('json-api', 'non-admin.com')

    uploader = new StorageUploader({
      nanostoreURL: 'https://nanostore.babbage.systems',
      wallet: walletClient
    })

    // Spy on global.fetch to simulate network requests
    globalFetchSpy = jest.spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should upload a real file, produce a valid UHRP URL, and decode to the known SHA-256', async () => {
    const mockBuffer = Buffer.from('hello world')

    const result = await uploader.upload({
      uploadURL: 'https://example-upload.com/put',
      publicURL: 'https://example.com/public/hello',
      file: {
        dataAsBuffer: mockBuffer,
        size: mockBuffer.length,
        type: 'text/plain'
      }
    })

    expect(globalFetchSpy).toHaveBeenCalledTimes(1)
    expect(StorageUtils.isValidURL(result.hash)).toBe(true)

    console.log('publicURL:', result.publicURL)
    console.log('hash:', result.hash)

    const rawHash = StorageUtils.getHashFromURL(result.hash).toString('hex')
    expect(rawHash.startsWith('b94d27b9')).toBe(true)
    expect(result).toEqual({
      published: true,
      hash: result.hash,
      publicURL: 'https://example.com/public/hello'
    })
  })

  it('should throw if the upload fails', async () => {
    globalFetchSpy.mockResolvedValueOnce(new Response(null, { status: 500 }))

    await expect(
      uploader.upload({
        uploadURL: 'https://example-upload.com/put',
        publicURL: 'https://example.com/public/fail',
        file: {
          dataAsBuffer: Buffer.from('failing data'),
          size: 12
        }
      })
    ).rejects.toThrow('File upload failed with HTTP 500')
  })

  it('should successfully generate an invoice', async () => {
    globalFetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({
        ORDER_ID: '12345',
        identityKey: 'test-key',
        amount: 100,
        publicURL: 'https://example.com/file',
        status: 'success'
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))

    const result = await uploader.invoice(500, 30)
    expect(result).toEqual({
      ORDER_ID: '12345',
      identityKey: 'test-key',
      amount: 100,
      publicURL: 'https://example.com/file',
      status: 'success'
    })
  })

  // ============================
  // Test: Payment Processing
  // ============================
  it('should successfully make a payment', async () => {
    globalFetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({
        ORDER_ID: '12345',
        amount: 100,
        identityKey: 'test-key',
        publicURL: 'https://example.com/file',
        status: 'success'
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))

    const result = await uploader.pay({
      orderID: '12345',
      recipientPublicKey: 'recipient-key',
      amount: 100
    })
    expect(result).toEqual({
      ORDER_ID: '12345',
      amount: 100,
      identityKey: 'test-key',
      publicURL: 'https://example.com/file',
      status: 'success'
    })
  })

  // ============================
  // Test: Full Publish Flow
  // ============================
  it('should publish a file and return the public URL and hash', async () => {
    const mockBuffer = Buffer.from('hello world')

    // Mock invoice
    globalFetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({
        ORDER_ID: '12345',
        identityKey: 'test-key',
        amount: 100,
        publicURL: 'https://example.com/file',
        status: 'success'
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))

    // Mock payment
    globalFetchSpy.mockResolvedValueOnce(new Response(
      JSON.stringify({
        status: 'success'
      }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ))

    // Mock file upload
    globalFetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await uploader.publishFile({
      file: {
        dataAsBuffer: mockBuffer,
        size: mockBuffer.length,
        type: 'text/plain'
      },
      retentionPeriod: 500000
    })

    expect(globalFetchSpy).toHaveBeenCalledTimes(3)
    expect(StorageUtils.isValidURL(result.hash)).toBe(true)
    expect(result).toEqual({
      published: true,
      hash: result.hash,
      publicURL: 'https://example.com/file'
    })
  })
})
