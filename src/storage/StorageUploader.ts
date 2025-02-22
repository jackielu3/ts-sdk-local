import { AuthFetch, WalletInterface, StorageUtils } from '../../mod.js'

export interface UploaderConfig {
    nanostoreURL: string
    wallet: WalletInterface
}

export interface InvoiceResult {
    ORDER_ID: string
    identityKey: string
    amount: number
    publicURL: string
    status: string
    message?: string
}

export interface PayResult {
    publicURL: string
    status: string
    description?: string
}

export interface UploadResult {
    published: boolean
    hash: string
    publicURL: string
}

export type UploadableFile =
    | File
    | {
        dataAsBuffer: Buffer
        size: number
        type?: string
    }


export class StorageUploader {
    private authFetch: AuthFetch
    private baseURL: string

    constructor(config: UploaderConfig) {
        this.baseURL = config.nanostoreURL
        this.authFetch = new AuthFetch(config.wallet)
    }

    public async invoice(
        fileSize: number,
        retentionPeriod: number
    ): Promise<InvoiceResult> {
        const payload = { fileSize, retentionPeriod }
        const url = `${this.baseURL}/invoice`

        const response = await this.authFetch.fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        if (!response.ok) {
            throw new Error(`Invoice request failed with HTTP ${response.status}`)
        }

        const data = (await response.json()) as InvoiceResult
        if (data.status === 'error') {
            throw new Error(data.message || 'Invoice request returned an error.')
        }
        return data
    }

    public async pay(params: {
        orderID: string
        recipientPublicKey: string
        amount: number
    }): Promise<PayResult> {
        const { orderID, recipientPublicKey, amount } = params

        const bodyObj = {
            orderID,
            recipientPublicKey,
            amount
        }

        const response = await this.authFetch.fetch(`${this.baseURL}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyObj)
        })
        if (!response.ok) {
            throw new Error(`Payment request failed with HTTP ${response.status}`)
        }
        const result = (await response.json()) as PayResult
        if (result.status === 'error') {
            throw new Error(result.description || 'Payment request returned an error.')
        }
        return result
    }

    public async upload(params: {
        uploadURL: string
        publicURL: string
        file: UploadableFile
        onUploadProgress?: (prog: { loaded: number; total: number }) => void
    }): Promise<UploadResult> {
        const { uploadURL, publicURL, file, onUploadProgress } = params

        let bodyToUpload: BodyInit
        let fileBuffer: Buffer
        if ('dataAsBuffer' in file) {
            bodyToUpload = file.dataAsBuffer
            fileBuffer = Buffer.from(file.dataAsBuffer)
        } else {
            bodyToUpload = file
            fileBuffer = await file.arrayBuffer().then(buf => Buffer.from(buf))
        }

        // Upload with fetch
        const uploadPromise = fetch(uploadURL, {
            method: 'PUT',
            body: bodyToUpload
        }).then(res => {
            if (!res.ok) {
                throw new Error(`File upload failed with HTTP ${res.status}`)
            }
            return res
        })

        // Compute the file hash
        const hashPromise = StorageUtils.getURLForFile(fileBuffer)

        const [, fileHash] = await Promise.all([uploadPromise, hashPromise])

        return {
            published: true,
            hash: fileHash,
            publicURL
        }
    }
    public async publishFile(params: {
        file: UploadableFile
        retentionPeriod: number
    }): Promise<UploadResult> {
        const invoiceResult = await this.invoice(params.file.size, params.retentionPeriod)

        await this.pay({
            orderID: invoiceResult.ORDER_ID,
            recipientPublicKey: invoiceResult.identityKey,
            amount: invoiceResult.amount
        })

        const uploadURL = invoiceResult.publicURL.replace('/public/', '/upload/')
        return this.upload({
            uploadURL,
            publicURL: invoiceResult.publicURL,
            file: params.file
        })
    }
}


