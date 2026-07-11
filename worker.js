// SPDX-License-Identifier: GPL-3.0-or-later
//
// NFD - No Fraud / Node Forward Bot
// Copyright (C) 2024 LloydAsp (original author)
//   https://github.com/LloydAsp/nfd
//
// NFD-D1-V1 - Fork using D1 (SQLite) instead of Workers KV
// Copyright (C) 2024 mireve (modifications)
// Modified on 2026-07-11
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.
//
// Modifications compared to original NFD:
// - Storage backend changed from Workers KV to D1 (SQLite)
// - Converted from Service Worker format to ES Modules
// - Added comprehensive error handling (try/catch on all paths)
// - Added fetch timeout with AbortController (10s default)
// - Fraud database cached to D1 instead of fetching on every message
// - Added /syncFraudDb command for manual fraud DB updates
// - Changed enable_notification to configurable env variable
// - Secured /init endpoint with webhook secret
// - Non-text messages now forwarded correctly
// - Improved code style (naming, parameter handling)

let TOKEN
let SECRET
let ADMIN_UID
let enableNotification

const WEBHOOK = '/endpoint'
const NOTIFY_INTERVAL = 3600 * 1000;
const fraudDb = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/fraud.db';
const notificationUrl = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/notification.txt'
const startMsgUrl = 'https://raw.githubusercontent.com/LloydAsp/nfd/main/data/startMessage.md';

function logError(context, error) {
  console.error(`[NFD-D1] ${context}:`, error?.message || error)
}

async function fetchWithTimeout(url, options, timeout = 10000){
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function apiUrl (methodName, params = null) {
  let query = ''
  if (params) {
    query = '?' + new URLSearchParams(params).toString()
  }
  return `https://api.telegram.org/bot${TOKEN}/${methodName}${query}`
}

async function requestTelegram(methodName, body, params = null){
  try {
    const response = await fetchWithTimeout(apiUrl(methodName, params), body)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Telegram API ${methodName} returned ${response.status}: ${text}`)
    }
    return await response.json()
  } catch (error) {
    logError(`requestTelegram(${methodName})`, error)
    throw error
  }
}

function makeReqBody(body){
  return {
    method:'POST',
    headers:{
      'content-type':'application/json'
    },
    body:JSON.stringify(body)
  }
}

function sendMessage(msg = {}){
  return requestTelegram('sendMessage', makeReqBody(msg))
}

function copyMessage(msg = {}){
  return requestTelegram('copyMessage', makeReqBody(msg))
}

function telegramForwardMessage(msg){
  return requestTelegram('forwardMessage', makeReqBody(msg))
}

export default {
  async fetch(request, env, ctx) {
    TOKEN = env.ENV_BOT_TOKEN
    SECRET = env.ENV_BOT_SECRET
    ADMIN_UID = env.ENV_ADMIN_UID
    enableNotification = env.ENABLE_NOTIFICATION !== 'false'

    try {
      const url = new URL(request.url)

      if (url.pathname === '/init') {
        if (url.searchParams.get('secret') !== SECRET) {
          return new Response('Unauthorized', { status: 403 })
        }
        await initDatabase(env)
        return new Response('Database initialized')
      }

      if (url.pathname === WEBHOOK) {
        return handleWebhook(request, env, ctx)
      } else if (url.pathname === '/registerWebhook') {
        return registerWebhook(request, url, env)
      } else if (url.pathname === '/unRegisterWebhook') {
        return unRegisterWebhook(env)
      } else if (url.pathname === '/syncFraudDb') {
        const count = await syncFraudUsers(env)
        return new Response(`Fraud database synced: ${count} entries`, { status: 200 })
      }

      return new Response('No handler for this request')
    } catch (error) {
      logError('fetch handler', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  }
}

async function initDatabase(env) {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS msg_mappings (
        forwarded_msg_id INTEGER PRIMARY KEY,
        guest_chat_id TEXT NOT NULL
      )`
    ).run()

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS blocked_users (
        chat_id TEXT PRIMARY KEY,
        is_blocked INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch())
      )`
    ).run()

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS notify_timestamps (
        chat_id TEXT PRIMARY KEY,
        last_time INTEGER NOT NULL
      )`
    ).run()

    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS fraud_users (
        chat_id TEXT PRIMARY KEY
      )`
    ).run()
  } catch (error) {
    logError('initDatabase', error)
    throw error
  }
}

async function handleWebhook (request, env, ctx) {
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== SECRET) {
    return new Response('Unauthorized', { status: 403 })
  }

  let update
  try {
    update = await request.json()
  } catch (error) {
    logError('handleWebhook JSON parse', error)
    return new Response('Bad Request', { status: 400 })
  }

  ctx.waitUntil(
    (async () => {
      try {
        await onUpdate(update, env)
      } catch (error) {
        logError('onUpdate async', error)
      }
    })()
  )

  return new Response('Ok')
}

async function onUpdate (update, env) {
  if ('message' in update) {
    await onMessage(update.message, env)
  }
}

async function onMessage (message, env) {
  try {
    if(message.text === '/start'){
      let startMsg
      try {
        startMsg = await fetchWithTimeout(startMsgUrl).then(r => r.text())
      } catch (error) {
        logError('fetch startMsg', error)
        startMsg = '欢迎使用 NFD 转发机器人'
      }
      return sendMessage({
        chat_id:message.chat.id,
        text:startMsg,
      })
    }
    if(message.chat.id.toString() === ADMIN_UID){
      if(/^\/syncFraudDb$/.exec(message.text)){
        return handleSyncFraudDb(env)
      }

      if(!message?.reply_to_message?.chat){
        return sendMessage({
          chat_id:ADMIN_UID,
          text:'使用方法，回复转发的消息，并发送回复消息，或者`/block`、`/unblock`、`/checkblock`、`/syncFraudDb` 等指令'
        })
      }
      if(/^\/block$/.exec(message.text)){
        return handleBlock(message, env)
      }
      if(/^\/unblock$/.exec(message.text)){
        return handleUnBlock(message, env)
      }
      if(/^\/checkblock$/.exec(message.text)){
        return checkBlock(message, env)
      }
      let row
      try {
        row = await env.DB.prepare(
          'SELECT guest_chat_id FROM msg_mappings WHERE forwarded_msg_id = ?'
        ).bind(message.reply_to_message.message_id).first()
      } catch (error) {
        logError('query msg_mappings', error)
        return sendMessage({
          chat_id: ADMIN_UID,
          text: '数据库查询失败，请稍后重试'
        })
      }

      if (!row) {
        return sendMessage({
          chat_id: ADMIN_UID,
          text: '未找到对应的用户消息映射，可能已过期'
        })
      }

      return copyMessage({
        chat_id: row.guest_chat_id,
        from_chat_id:message.chat.id,
        message_id:message.message_id,
      })
    }
    return handleGuestMessage(message, env)
  } catch (error) {
    logError('onMessage', error)
    try {
      await sendMessage({
        chat_id: ADMIN_UID,
        text: `处理消息时出错: ${error?.message}`
      })
    } catch (_) {}
  }
}

async function handleGuestMessage(message, env){
  try {
    let chatId = message.chat.id;
    let row
    try {
      row = await env.DB.prepare(
        'SELECT is_blocked FROM blocked_users WHERE chat_id = ?'
      ).bind(chatId.toString()).first()
    } catch (error) {
      logError('check blocked', error)
    }

    if(row && row.is_blocked === 1){
      return sendMessage({
        chat_id: chatId,
        text:'You are blocked'
      })
    }

    let isFraudUser = false
    try {
      isFraudUser = await isFraud(chatId, env)
    } catch (error) {
      logError('isFraud check', error)
    }

    if (isFraudUser) {
      try {
        await sendMessage({
          chat_id: ADMIN_UID,
          text: `⚠️ 诈骗警告：UID ${chatId} 在欺诈数据库中，消息已转发，请谨慎交易`
        })
      } catch (error) {
        logError('fraud warning message', error)
      }
    }

    let forwardReq
    try {
      forwardReq = await telegramForwardMessage({
        chat_id:ADMIN_UID,
        from_chat_id:message.chat.id,
        message_id:message.message_id
      })
    } catch (error) {
      logError('forward message', error)
      return sendMessage({
        chat_id: chatId,
        text: '消息转发失败，请稍后重试'
      })
    }

    if(forwardReq.ok){
      try {
        await env.DB.prepare(
          'INSERT OR REPLACE INTO msg_mappings (forwarded_msg_id, guest_chat_id) VALUES (?, ?)'
        ).bind(forwardReq.result.message_id, chatId.toString()).run()
      } catch (error) {
        logError('save msg_mapping', error)
      }
    }
    await handleNotify(message, env)
  } catch (error) {
    logError('handleGuestMessage', error)
  }
}

async function handleNotify(message, env){
  try {
    let chatId = message.chat.id;
    if(enableNotification){
      let row
      try {
        row = await env.DB.prepare(
          'SELECT last_time FROM notify_timestamps WHERE chat_id = ?'
        ).bind(chatId.toString()).first()
      } catch (error) {
        logError('query notify_timestamps', error)
      }

      if(!row || Date.now() - row.last_time > NOTIFY_INTERVAL){
        try {
          await env.DB.prepare(
            'INSERT OR REPLACE INTO notify_timestamps (chat_id, last_time) VALUES (?, ?)'
          ).bind(chatId.toString(), Date.now()).run()
        } catch (error) {
          logError('save notify_timestamp', error)
        }

        let notificationText
        try {
          notificationText = await fetchWithTimeout(notificationUrl).then(r => r.text())
        } catch (error) {
          logError('fetch notification', error)
          notificationText = '请谨慎交易，注意安全'
        }

        try {
          await sendMessage({
            chat_id: ADMIN_UID,
            text: notificationText
          })
        } catch (error) {
          logError('send notification', error)
        }
      }
    }
  } catch (error) {
    logError('handleNotify', error)
  }
}

async function handleBlock(message, env){
  try {
    let row
    try {
      row = await env.DB.prepare(
        'SELECT guest_chat_id FROM msg_mappings WHERE forwarded_msg_id = ?'
      ).bind(message.reply_to_message.message_id).first()
    } catch (error) {
      logError('handleBlock query', error)
      return sendMessage({
        chat_id: ADMIN_UID,
        text: '数据库查询失败'
      })
    }

    if(!row){
      return sendMessage({
        chat_id: ADMIN_UID,
        text:'未找到消息映射'
      })
    }

    let guestChatId = row.guest_chat_id

    if(guestChatId === ADMIN_UID){
      return sendMessage({
        chat_id: ADMIN_UID,
        text:'不能屏蔽自己'
      })
    }

    await env.DB.prepare(
      'INSERT OR REPLACE INTO blocked_users (chat_id, is_blocked) VALUES (?, 1)'
    ).bind(guestChatId).run()

    return sendMessage({
      chat_id: ADMIN_UID,
      text: `UID:${guestChatId}屏蔽成功`,
    })
  } catch (error) {
    logError('handleBlock', error)
    return sendMessage({
      chat_id: ADMIN_UID,
      text: '屏蔽操作失败'
    })
  }
}

async function handleUnBlock(message, env){
  try {
    let row
    try {
      row = await env.DB.prepare(
        'SELECT guest_chat_id FROM msg_mappings WHERE forwarded_msg_id = ?'
      ).bind(message.reply_to_message.message_id).first()
    } catch (error) {
      logError('handleUnBlock query', error)
      return sendMessage({
        chat_id: ADMIN_UID,
        text: '数据库查询失败'
      })
    }

    if(!row){
      return sendMessage({
        chat_id: ADMIN_UID,
        text:'未找到消息映射'
      })
    }

    let guestChatId = row.guest_chat_id

    await env.DB.prepare(
      'INSERT OR REPLACE INTO blocked_users (chat_id, is_blocked) VALUES (?, 0)'
    ).bind(guestChatId).run()

    return sendMessage({
      chat_id: ADMIN_UID,
      text:`UID:${guestChatId}解除屏蔽成功`,
    })
  } catch (error) {
    logError('handleUnBlock', error)
    return sendMessage({
      chat_id: ADMIN_UID,
      text: '解除屏蔽操作失败'
    })
  }
}

async function checkBlock(message, env){
  try {
    let row
    try {
      row = await env.DB.prepare(
        'SELECT guest_chat_id FROM msg_mappings WHERE forwarded_msg_id = ?'
      ).bind(message.reply_to_message.message_id).first()
    } catch (error) {
      logError('checkBlock query', error)
      return sendMessage({
        chat_id: ADMIN_UID,
        text: '数据库查询失败'
      })
    }

    if(!row){
      return sendMessage({
        chat_id: ADMIN_UID,
        text:'未找到消息映射'
      })
    }

    let guestChatId = row.guest_chat_id
    let blockedRow
    try {
      blockedRow = await env.DB.prepare(
        'SELECT is_blocked FROM blocked_users WHERE chat_id = ?'
      ).bind(guestChatId).first()
    } catch (error) {
      logError('checkBlock query blocked', error)
      return sendMessage({
        chat_id: ADMIN_UID,
        text: '查询屏蔽状态失败'
      })
    }

    return sendMessage({
      chat_id: ADMIN_UID,
      text: `UID:${guestChatId}` + (blockedRow?.is_blocked === 1 ? '被屏蔽' : '没有被屏蔽')
    })
  } catch (error) {
    logError('checkBlock', error)
    return sendMessage({
      chat_id: ADMIN_UID,
      text: '查询操作失败'
    })
  }
}

async function registerWebhook (request, requestUrl, env) {
  try {
    const webhookUrl = `${requestUrl.protocol}//${requestUrl.hostname}${WEBHOOK}`
    const response = await fetchWithTimeout(apiUrl('setWebhook', { url: webhookUrl, secret_token: SECRET }))
    if (!response.ok) {
      return new Response(`HTTP ${response.status}: ${await response.text()}`, { status: 500 })
    }
    const r = await response.json()
    return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
  } catch (error) {
    logError('registerWebhook', error)
    return new Response('Failed to register webhook', { status: 500 })
  }
}

async function unRegisterWebhook (env) {
  try {
    const response = await fetchWithTimeout(apiUrl('setWebhook', { url: '' }))
    if (!response.ok) {
      return new Response(`HTTP ${response.status}: ${await response.text()}`, { status: 500 })
    }
    const r = await response.json()
    return new Response('ok' in r && r.ok ? 'Ok' : JSON.stringify(r, null, 2))
  } catch (error) {
    logError('unRegisterWebhook', error)
    return new Response('Failed to unregister webhook', { status: 500 })
  }
}

async function isFraud(id, env){
  try {
    const idStr = id.toString()
    let row = await env.DB.prepare(
      'SELECT 1 FROM fraud_users WHERE chat_id = ?'
    ).bind(idStr).first()
    return row !== null
  } catch (error) {
    logError('isFraud', error)
    return false
  }
}

async function syncFraudUsers(env) {
  try {
    let response = await fetchWithTimeout(fraudDb)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    let text = await response.text()
    let ids = text.split(/\r?\n/).map(v => v.trim()).filter(v => v)

    let statements = [
      env.DB.prepare('DELETE FROM fraud_users'),
      ...ids.map(id => env.DB.prepare(
        'INSERT OR IGNORE INTO fraud_users (chat_id) VALUES (?)'
      ).bind(id))
    ]

    for (let i = 0; i < statements.length; i += 100) {
      await env.DB.batch(statements.slice(i, i + 100))
    }

    logError('syncFraudUsers', `synced ${ids.length} entries`)
    return ids.length
  } catch (error) {
    logError('syncFraudUsers', error)
    throw error
  }
}

async function handleSyncFraudDb(env) {
  try {
    await sendMessage({
      chat_id: ADMIN_UID,
      text: '正在同步诈骗数据库，请稍候...'
    })
    let count = await syncFraudUsers(env)
    return sendMessage({
      chat_id: ADMIN_UID,
      text: `诈骗数据库同步完成，共 ${count} 条记录`
    })
  } catch (error) {
    logError('handleSyncFraudDb', error)
    return sendMessage({
      chat_id: ADMIN_UID,
      text: `诈骗数据库同步失败: ${error?.message}`
    })
  }
}
