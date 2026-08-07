// A self-signed certificate for 127.0.0.1, used only by
// tests/integration/push.send.test.ts.
//
// It exists because web-push refuses to deliver to a plain-http endpoint —
// correctly, since a push endpoint carries an encrypted payload across the
// internet. The fake push service in that suite therefore has to speak TLS,
// and Node has no API for minting a certificate at runtime.
//
// Nothing here is a secret. The key protects a server that the test process
// starts, talks to over loopback, and shuts down again. It is checked in for
// the same reason a fixture JSON file is: so the suite runs with no setup step.
// Regenerate (valid ten years) with:
//
//   openssl req -x509 -newkey rsa:2048 -keyout k.pem -out c.pem -days 3650 \
//     -nodes -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"

export const key = [
  "-----BEGIN PRIVATE KEY-----",
  "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDG8G+J5pgv2+K1",
  "5QmzWnXwg+wVFvoGjp2XS3xS64z+QQfobwLIzoDdBjj4P80w9xZRXGxIz9+x+150",
  "PAIPwuFjO//GPutRucKQfifU/jb25pXE1/+uhFGCL/xk5z+D3ekmteiDPW4Abn7Q",
  "W8bknZzy8+Vsh+2aZZftJ2SGaX3DAOrvlA65NFR0dkIv/FPDZe7YHSMmbPyRTNsU",
  "8CJ2h7xW+27DoVbBqiiSC0dkCbWL1NM5T3oa2bXvruvu41f6FXTwazLGJRy8iKX/",
  "HPOgZ+bonVQwCr8glsVdLstQdJwPk4tnM5d/XKz2LZQktE7vmrZfCKRr4bc8T7l+",
  "uRHCvTZtAgMBAAECggEAKwhI1EdPXbDecDKoP8XeU6WxrFkxQbhZQegX7zbZI4lt",
  "HLvgmg/DQ6wsKBTi/YfBKd3IZZKjpHQHmTR+zKp+xxCsMdWb4OyB9+/2DUZlHNDB",
  "jlgbzEP+fp8DJU95R3y5yYAZWMQxtoGwSEFF+19Vmx8jXi/j910o+SlnfwS0Kbk4",
  "HPWLKgBNHyCXmIr3hbjLSf3dt4cfC0vG2J6DpL1bCqKSdb3Hc2uVVXZxfzp8QcY3",
  "p6x6TDGuuM0QnWJeqMTNC0v8wd8amk+vU7oHYu4l5cmEj8ZU+CKemF4oyVQyu1u8",
  "IJBv+tjj69egGg6NuFx+5otFouY4mstMeZNKzza6gQKBgQDsLS2b3eIJiIEyIWru",
  "YhGS1IPCri/XnaXYM4sHQjmF+zQELEOcmJ9ObmCbn46rX6AsHKaRUDgxK4Wx6avP",
  "6qDU535F3lXpEsje4NfCXupybeBoymtUFyQ4cT7iV+H2kMWHL6dkkw2SZfWBrisF",
  "IgApa2C4qF4sw2lfDQ5Mx+8E7QKBgQDXox/xKSK3NcRa8nIHBrvmw9GUaqAxdpQt",
  "pilXg8MqtN4uhynXjkXCKVdOIuGOsHmFCINnEhRJHX/psXHE2fQvD1cUoKAzapNk",
  "cJsDRVqa/p6qWr1uZXeA2rbBzE66UxvNnLIpTUaZElQptbu3P1hRGLoGlhqnPlVw",
  "ZEfu/OZHgQKBgQDEbIakPZPC7f7VnKl8fZ+0CH9VKN2ta/YErEmSzeddoSEP32iU",
  "EvNbnb1HcRqNOUjTpzh5Xsh9TH8zCu7US4VbzPReU54L7I2XoFSR2bMPXIbpYICH",
  "PX/oWXc9dG4ATUObPWzw3sTI33eiVSJ+cFrGGAInUhCRFizK2ubrwNTvuQKBgEBk",
  "M7ud3wH6ikHmN+qlNiL4wnKhTGi40hK3lYzOic8M53PZZMM7dtU95xYsEFK9m+v/",
  "2M1Eds5GgtXT6PcxZltPJ1+/f1cbMhxCC+f0I9Q4yERyiDKZFhBiP0Srr66v9pN1",
  "gTYYH0bCVGOIIx/bSJIe4h3pYNgkIvtG1rwkxNcBAoGBANtXkMUCPATMnCbumQa4",
  "sRlSZUy2vG3f6H2GCd7CxdcBqdbL6e8/zXOaPWruwFrzJQZ9l88ZsZxr8tjblwdJ",
  "tCp6Zu8Vj+xn3YQw4oXUU4nisAQH3V9Z1f+4ceLNDdeqCnz7fdthSJ/+5ttRO8nI",
  "oNsWJC/TDRtZkiOG8HGw6E/v",
  "-----END PRIVATE KEY-----",
].join("\n");

export const cert = [
  "-----BEGIN CERTIFICATE-----",
  "MIIDJTCCAg2gAwIBAgIUIXLH1QcXyiZYlcQPLA41qAp2GpowDQYJKoZIhvcNAQEL",
  "BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDgwNzAyNDYyMloXDTM2MDgw",
  "NDAyNDYyMlowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF",
  "AAOCAQ8AMIIBCgKCAQEAxvBvieaYL9viteUJs1p18IPsFRb6Bo6dl0t8UuuM/kEH",
  "6G8CyM6A3QY4+D/NMPcWUVxsSM/fsftedDwCD8LhYzv/xj7rUbnCkH4n1P429uaV",
  "xNf/roRRgi/8ZOc/g93pJrXogz1uAG5+0FvG5J2c8vPlbIftmmWX7Sdkhml9wwDq",
  "75QOuTRUdHZCL/xTw2Xu2B0jJmz8kUzbFPAidoe8Vvtuw6FWwaookgtHZAm1i9TT",
  "OU96Gtm1767r7uNX+hV08GsyxiUcvIil/xzzoGfm6J1UMAq/IJbFXS7LUHScD5OL",
  "ZzOXf1ys9i2UJLRO75q2Xwika+G3PE+5frkRwr02bQIDAQABo28wbTAdBgNVHQ4E",
  "FgQUj+cWaXYz1Xwh0dnAkxo6dN0LrA0wHwYDVR0jBBgwFoAUj+cWaXYz1Xwh0dnA",
  "kxo6dN0LrA0wDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARhwR/AAABgglsb2Nh",
  "bGhvc3QwDQYJKoZIhvcNAQELBQADggEBAJRvDiEbW8OzkpDECtTXpWDSDP2BQmBQ",
  "CIpK0Bv8rQY5IHPnKPtNcjkCG/7min7kltok8RmteoF5lInKihxj/TesFnLitRgJ",
  "zTnKcV+hMFDYE7pjOTliDoG7PoJxJG+BbXul118w4TYdkcfUVwedk8kxyL9874Yq",
  "qGZOzMruTibuyKuDPXZBPpIaapbEDWfJHssls8ZsCIH7HgQqxDTL4P2keleeOL0n",
  "qbI1UYHnLyRvQH3kcdJ6K+hAtWw5Xm4ifwGLx3atqWx/OH4sAZLH6+GTpYlhKwdn",
  "U5BCeGoboHVP3w8N+/w/j+AwTvcmVakKN7wqQY2qqxOk6OrlKLBVqok=",
  "-----END CERTIFICATE-----",
].join("\n");
