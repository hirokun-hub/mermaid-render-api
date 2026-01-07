import { request } from 'node:http'

export interface HttpResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: Buffer
}

export async function httpRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
  } = {}
): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve, reject) => {
    const req = request(
      url,
      {
        method: options.method ?? 'GET',
        headers: options.headers
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        })
      }
    )

    req.on('error', reject)

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}
