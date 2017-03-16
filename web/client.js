const request = require('superagent')
    , qruri   = require('qruri')
    , round   = require('round')
    , Coin    = require('bcoin/lib/primitives/coin')
    , { throwerr }       = require('iferr')
    , { lock, unlock }   = require('../hodl')
    , { formatSatoshis } = require('../util')
    , { makeVoteMsg }    = require('./util')

const voteDialog    = require('./views/vote-dialog.pug')
const payDialog     = require('./views/pay-dialog.pug')
const successDialog = require('./views/success-dialog.pug')

const question = JSON.parse($('meta[name=question]').attr('content'))

$('[data-vote]').click(e => {
  e.preventDefault()
  const option_id =  $(e.target).data('vote')
      , option = question.options.filter(o => o.id == option_id)[0]
  $(voteDialog({ question, option })).modal()
})

$(document.body).on('submit', 'form[data-question]', e => {
  e.preventDefault()
  $('.vote-dialog').modal('hide')

  const form      = $(e.target)

      , amount    = +form.find('[name=amount]').val()
      , dur_type  = form.find('[name=duration_type]').val()
      , duration  = +form.find('[name=duration]').val()
      , rlocktime = dur_type == 'days' ?0|duration*144 : duration
      , refund    = +form.find('[name=refund_addr]').val()
      , option_id = form.find('[name=answer]').val()
      , option    = question.options.filter(o => o.id == option_id)[0]
      , weight    = amount * rlocktime

      , msg       = makeVoteMsg(question, option)
      , lockbox   = lock(rlocktime, msg)

      , pay_uri   = `bitcoin:${ lockbox.address  }?amount=${ amount }`
      , pay_qr    = qruri(pay_uri)

  const dialog = $(payDialog({ question, amount, weight, lockbox, pay_uri, pay_qr, round })).modal()

  request('/wait/'+lockbox.address, throwerr(res => {
    if (!res.ok) return alert('payment time out')

    const coin     = Coin.fromJSON(res.body.coin)
        , locktx   = res.body.tx
        , weight   = round(+formatSatoshis(coin.value * lockbox.rlocktime), 0.00001)
        , amount   = formatSatoshis(coin.value)
        , refundtx = unlock(lockbox, coin, refund)
        , rawtx    = refundtx.toRaw().toString('hex')

    dialog.find('.btn-primary').toggleClass('btn-primary btn-success')
                               .text('Processing vote...')
                               .attr('disabled', true)

    request.post(`/${ question.slug }/${ option.id }/vote`)
      .send({ tx: locktx, pubkey: lockbox.pubkey, rlocktime: lockbox.rlocktime, refundtx: rawtx })
      .end(throwerr(res => (dialog.modal('hide').remove(), res.ok
         ? $(successDialog({ question, option, coin, amount, weight, lockbox, rawtx, round })).modal()
         : alert('proof-of-HODL verification failed'))))
  }))

})

