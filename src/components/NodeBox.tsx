import { Nodebox } from '@codesandbox/nodebox'

const iframe = document.createElement('iframe')
iframe.className = 'fixed left-0 top--2 w-1 h-1'
document.body.appendChild(iframe)

const nodebox = new Nodebox({
  iframe
})

nodebox.connect().then(async () => {
  await nodebox.fs.init({
    '/package.json': `{ "name": "nodebox-test", "version": "1.0.0", "dependencies": { "vite": "*", "esbuild-wasm": "*" } }`,
    '/index.html': `<html><body><script src="./index.js"></script></body></html>`,
    '/index.js': `document.body.write('Hello, world!')`
  })

  // await nodebox.fs.writeFile(
  //   '/node_modules/esbuild/lib/api.js',
  //   `module.exports=require("esbuild-wasm")`
  // )

  const shell = nodebox.shell.create()
  shell.stdout.on('data', (data) => {
    console.log(data)
  })
  shell.stderr.on('data', (data) => {
    console.error(data)
  })

  await shell.runCommand('vite', ['index.html'], {
    env: {
      DB_URL: 'https://example.com'
    }
  })

  console.log('shell running')

  const previewInfo = await nodebox.preview.getByShellId(shell.id!)
  const previewIframe = document.createElement('iframe')
  previewIframe.src = previewInfo.url
  document.body.appendChild(previewIframe)
  console.log(previewInfo)
})
