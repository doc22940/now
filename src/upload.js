import crypto from 'crypto-js'
import { readFile, concatArrayBuffers } from './stream-tools'


/**
 * Get the name of a file
 *
 * @param {File} file - File object from the input
 * @returns
 */
function getFileName(file) {
  if (file.fullPath) {
    return file.fullPath
  }

  if (!file.webkitRelativePath || file.webkitRelativePath.length === 0) {
    return file.name
  }
  
  const [, ...path] = file.webkitRelativePath.split('/')

  return path.join('/')
}


/**
 * Upload file to Now
 *
 * @export
 * @param {File} file - File object from the input
 * @param {string} token - ZEIT API token
 * @returns
 */
export default function uploadFile(file, token, onFileUploaded) {
  return new Promise((resolve, reject) => {
    const streamOrFile = readFile(file)

    // If it's a stream
    if (streamOrFile.getReader) {
      const reader = streamOrFile.getReader()
  
      // Prepare
      let streamResult = new Uint8Array()
      const sha = crypto.algo.SHA1.create()
    
      // Start reading data from the stream
      reader.read().then(function processStream({ done, value }) {
        // If the stream is over, calculate SHA1 and upload the file
        if (done) {
          reader.releaseLock() // Release lock so `fetch` can read the stream
  
          const length = streamResult.byteLength
          const sha1 = sha.finalize().toString()
  
          const req = new Request('https://api.zeit.co/v2/now/files', {
            method: 'POST',
            mode: 'cors',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/octet-stream',
              'x-now-digest': sha1
            }
          })
    
          req.body = streamOrFile
    
          // Upload stream
          fetch(req).then(async res => {
            const { error } = await res.json()
            
            if (error) {
              return reject(error)
            }
  
            if (typeof onFileUploaded === 'function') {
              onFileUploaded(file)
            }
  
            return resolve({
              length,
              sha1,
              name: getFileName(file),
              data: streamResult
            })
          })
          
          return
        }
    
        // If we're not done yet, update SHA1, append data to the result and continue reading
        sha.update(crypto.lib.WordArray.create(value))
        streamResult = concatArrayBuffers(streamResult, value)
    
        return reader.read().then(processStream)
      })
    } else {
      // If it's a file
      streamOrFile.then(e => {
        const { result } = e.target
        const sha = crypto.algo.SHA1.create()
        
        sha.update(crypto.lib.WordArray.create(result))
        const sha1 = sha.finalize().toString()

        fetch('https://api.zeit.co/v2/now/files', {
          method: 'POST',
          mode: 'cors',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
            'x-now-digest': sha1
          },
          body: result
        }).then(async res => {
            const { error } = await res.json()
            
            if (error) {
              return reject(error)
            }
  
            if (typeof onFileUploaded === 'function') {
              onFileUploaded(result)
            }
  
            return resolve({
              length,
              sha1,
              name: getFileName(file),
              data: result
            })
          })
          
          return
        })
    }

  })
}