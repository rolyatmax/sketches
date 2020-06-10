export default function includeFont ({ url, fontFamily }) {
  if (!url) throw new Error('includeFont expects an opts object that includes `url`')
  const link = document.createElement('link')
  link.href = url
  link.rel = 'stylesheet'
  link.type = 'text/css'
  document.head.appendChild(link)
  if (fontFamily) {
    document.body.style.fontFamily = fontFamily
  }
}
