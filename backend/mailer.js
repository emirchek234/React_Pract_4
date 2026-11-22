import net from 'node:net'
import tls from 'node:tls'
import { createInterface } from 'node:readline'

async function connect(socket) {
  await new Promise((resolve, reject) => {
    if (socket instanceof tls.TLSSocket) {
      if (!socket.secureConnecting) return resolve()
      socket.once('secureConnect', resolve)
    } else {
      if (!socket.connecting) return resolve()
      socket.once('connect', resolve)
    }
    socket.once('error', reject)
  })
}

function createReader(socket) {
  const readline = createInterface({ input: socket, crlfDelay: Infinity })
  const iterator = readline[Symbol.asyncIterator]()
  return {
    close: () => readline.close(),
    async response() {
      const lines = []
      while (true) {
        const next = await iterator.next()
        if (next.done) throw new Error('SMTP-сервер закрыл соединение.')
        lines.push(next.value)
        if (/^\d{3} /.test(next.value)) break
      }
      const code = Number(lines.at(-1).slice(0, 3))
      if (code >= 400) throw new Error(`SMTP: ${lines.join(' ')}`)
      return lines.join('\n')
    },
  }
}

async function command(socket, reader, value) {
  socket.write(`${value}\r\n`)
  return reader.response()
}

// Небольшой SMTP-клиент на встроенных модулях Node.js (без внешних зависимостей).
export async function sendMail({ host, port = 587, secure = false, user, pass, from, to, subject, text }) {
  let socket = secure
    ? tls.connect({ host, port, servername: host })
    : net.createConnection({ host, port })
  await connect(socket)
  let reader = createReader(socket)
  await reader.response() // приветствие сервера
  await command(socket, reader, 'EHLO service-studio.local')

  if (!secure) {
    try {
      await command(socket, reader, 'STARTTLS')
      reader.close()
      socket = tls.connect({ socket, servername: host })
      await connect(socket)
      reader = createReader(socket)
      await command(socket, reader, 'EHLO service-studio.local')
    } catch (error) {
      socket.destroy()
      throw new Error(`Не удалось установить защищённое SMTP-соединение: ${error.message}`)
    }
  }

  await command(socket, reader, 'AUTH LOGIN')
  await command(socket, reader, Buffer.from(user).toString('base64'))
  await command(socket, reader, Buffer.from(pass).toString('base64'))
  const fromAddress = from.match(/<([^>]+)>/)?.[1] || from
  await command(socket, reader, `MAIL FROM:<${fromAddress}>`)
  await command(socket, reader, `RCPT TO:<${to}>`)
  await command(socket, reader, 'DATA')

  const encodedBody = Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || ''
  const safeSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  const message = [
    `From: ${from}`, `To: ${to}`, `Subject: ${safeSubject}`, 'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', encodedBody, '.',
  ].join('\r\n')
  socket.write(`${message}\r\n`)
  await reader.response()
  await command(socket, reader, 'QUIT')
  reader.close()
  socket.end()
}
