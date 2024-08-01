import { rollup } from '@rollup/browser'

rollup({
  input: 'https://unpkg.com/rollup/dist/es/rollup.js',
  plugins: [
    {
      name: 'url-resolver',
      resolveId(source, importer) {
        if (source[0] !== '.') {
          try {
            new URL(source)
            // If it is a valid URL, return it
            return source
          } catch {
            // Otherwise make it external
            return { id: source, external: true }
          }
        }
        return new URL(source, importer).href
      },
      async load(id) {
        const response = await fetch(id)
        return response.text()
      }
    }
  ]
})
  .then((bundle) => bundle.generate({ format: 'es' }))
  .then(({ output }) => console.log(output))
