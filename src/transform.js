const { Transform } = require('stream')
const defer = require('p-defer')
const CHUNK_TRANSFORMED = {}

module.exports = function toTransform (transform) {
  let isFirstChunk = true
  let nextChunk = defer()
  let chunkTransformed = defer()

  const outputSource = transform({
    [Symbol.asyncIterator] () {
      return this
    },
    // When next is called, it means the transform has dealt with a chunk
    async next () {
      if (isFirstChunk) {
        isFirstChunk = false
      } else {
        chunkTransformed.resolve(CHUNK_TRANSFORMED)
      }
      const chunk = await nextChunk.promise
      nextChunk = defer()
      return { value: chunk }
    }
  })

  let nextOutputChunkPromise

  return new Transform({
    async transform (chunk, enc, cb) {
      nextChunk.resolve(chunk)

      try {
        while (true) {
          if (!nextOutputChunkPromise) {
            nextOutputChunkPromise = outputSource.next()
          }

          const res = await Promise.race([
            chunkTransformed.promise,
            nextOutputChunkPromise
          ])

          if (res === CHUNK_TRANSFORMED) {
            chunkTransformed = defer()
            break // We completed transforming a chunk
          }

          nextOutputChunkPromise = null

          if (!this.push(res.value)) {
            // We pushed a value but we should not push more
            // TODO? does this happen in transform streams?
          }
        }
      } catch (err) {
        return cb(err)
      }
      cb()
    }
  })
}
