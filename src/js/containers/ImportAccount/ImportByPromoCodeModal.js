import React from "react"
import { connect } from "react-redux"
import Recaptcha from "react-recaptcha"
import { importNewAccount, promoCodeChange, openPromoCodeModal, closePromoCodeModal } from "../../actions/accountActions"
import { addressFromPrivateKey } from "../../utils/keys"
import { getTranslate } from 'react-localize-redux'
import * as common from "../../utils/common"
import { verifyAccount } from "../../utils/validators";
import { Modal } from '../../components/CommonElement'
import BLOCKCHAIN_INFO from "../../../../env"

@connect((store) => {
  var tokens = store.tokens.tokens
  var supportTokens = []
  Object.keys(tokens).forEach((key) => {
    supportTokens.push(tokens[key])
  })
  return {
    account: store.account,
    ethereum: store.connection.ethereum,
    tokens: supportTokens,
    translate: getTranslate(store.locale),
    analytics: store.global.analytics,
    global: store.global
  }
})
export default class ImportByPromoCodeModal extends React.Component {
  constructor(){
    super()
    this.recaptchaInstance;
    this.state = {
      isLoading: false,
      error:"",
      errorPromoCode: "",
      errorCaptcha: "",
      captchaV: "",
      tokenCaptcha: "" ,
      isPassCapcha: false,
      isCaptchaLoaded: false
    }
  }

  componentDidMount = () => {
    if (window.kyberBus) {
      window.kyberBus.on("swap.import_promo_code", this.openModal.bind(this));
    }
  }

  openModal() {
    this.props.dispatch(openPromoCodeModal());
    this.props.analytics.callTrack("trackClickImportAccount", "promo code");
  }

  closeModal() {
    this.onPromoCodeChange();
    const iframeEle = document.getElementById("g-recaptcha").querySelector("iframe");
    iframeEle.removeEventListener("load", () => {
      this.setState({
        isCaptchaLoaded: false
      });
    });

    this.props.dispatch(closePromoCodeModal());
    this.props.analytics.callTrack("trackClickCloseModal", "import promo-code");
  }

  getPrivateKey = (promo, captcha) =>{
    return new Promise ((resolve, reject)=>{
      common.timeout(3000,  fetch(`/api/promo?g-recaptcha-response=${captcha}&code=${promo}`))
        .then((response) => {
          return response.json()
        })
        .then((result) => {
          if (result.error){
            reject(result.error)
            this.resetCapcha()
          } else {
            if (result.data.type === "payment") {
              const isValidAccount = verifyAccount(result.data.receive_address);
              if (isValidAccount === "invalid") {
                this.resetCapcha();
                reject(this.props.translate("error.invalid_promo_code"));
              }
            }
            resolve({
              privateKey: result.data.private_key,
              des_token: result.data.destination_token,
              description: result.data.description,
              type: result.data.type,
              receiveAddr: result.data.receive_address,
              expiredDate: result.data.expired_date
            })
          }
        })
        .catch((err) => {
          console.log(err)
          reject("Cannot get Promo code")
          this.resetCapcha()
        })
    })
  }

  resetCapcha = () => {
    this.recaptchaInstance.reset()
    this.setState({
      tokenCaptcha: "",
      isPassCapcha: false,
      isCaptchaLoaded: false
    });
    
    const iframeEle = document.getElementById("g-recaptcha").querySelector("iframe");
    iframeEle.removeEventListener("load", () => {});

    iframeEle.addEventListener("load", () => {
      this.setState({
        isCaptchaLoaded: true
      });
    });
  }
  
  verifyCallback = (response) => {
    if (response){
      this.setState({
        tokenCaptcha: response,
        isPassCapcha: true
      })
    }
  }

  onloadCallback = () => {
    // First render, show loading indicator
    this.setState({
      isCaptchaLoaded: false
    });

    // When iframe loading process is finished, show captcha box
    const iframeEle = document.getElementById("g-recaptcha").querySelector("iframe");
    iframeEle.addEventListener("load", () => {
      this.setState({
        isCaptchaLoaded: true
      });
    });
    
  }

  importPromoCode = (promoCode) => {
    var check = false
    if (promoCode === "") {
      this.setState({errorPromoCode: this.props.translate("error.promo_code_error") || "Promo code is empty."})
      check = true
    }

    var captcha = this.state.tokenCaptcha
    if (check){
      return
    }
    this.setState({isLoading: true})
    this.getPrivateKey(promoCode, captcha).then(result => {
      var privateKey = result.privateKey
      var address = addressFromPrivateKey(privateKey)
      this.props.dispatch(closePromoCodeModal());

      var info = { 
        description : result.description, 
        destToken: result.des_token, 
        promoType: result.type, 
        receiveAddr: result.receiveAddr,
        expiredDate: result.expiredDate
      }
      this.props.dispatch(importNewAccount(address,
        "promo",
        privateKey,
        this.props.ethereum,
        this.props.tokens, null, null, "PROMO CODE", info))
      this.setState({isLoading: false})
    }).catch(error => {
      this.setState({error: error, captchaV: (new Date).getTime()})
      this.setState({isLoading: false})
    })
  }

  onPromoCodeChange = () =>{
    this.setState({errorPromoCode: "", error: ""})
  }

  nextToCapcha = (e) => {
    if (e.key === 'Enter') {
      document.getElementById("capcha-promo").focus()
    }
  }

  apply = (e) => {
    if(!this.state.isPassCapcha){
      return
    }
    var promoCode = document.getElementById("promo_code").value
    this.importPromoCode(promoCode)
    this.props.analytics.callTrack("trackClickSubmitPromoCode");
  }

  render() {
    return (
      <div>
        <Modal
          className={{ base: 'reveal medium promocode', afterOpen: 'reveal medium import-privatekey' }}
          isOpen={this.props.account.promoCode.modalOpen}
          onRequestClose={this.closeModal.bind(this)}
          content={
            <div id="promocode-modal">
              <div className="title">
                {this.props.translate("import.promo_code") || "Promocode"}
                {this.state.error && (
                  <div className="error">{this.state.error}</div>
                )}
              </div>
              <a className="x" onClick={this.closeModal.bind(this)}>&times;</a>
              <div className="content with-overlap">
                <div className="row">
                  <div className="column">

                    <label className={!!this.state.errorPromoCode ? "error" : ""}>
                      <div className="input-reveal">
                        <input
                          className="text-center" id="promo_code"
                          type="text"
                          onChange={this.onPromoCodeChange.bind(this)}
                          onKeyPress={this.nextToCapcha.bind(this)}
                          autoFocus
                          autoComplete="off"
                          spellCheck="false"
                          onFocus={(e) => {this.props.analytics.callTrack("trackClickInputPromoCode")}}
                          required
                          placeholder={this.props.translate("import.enter_promo_code") || "Enter your promocode here"}
                        />
                      </div>
                      {!!this.state.errorPromoCode &&
                      <span className="error-text">{this.state.errorPromoCode}</span>
                      }
                    </label>
                    <div className="capcha-wrapper">
                      {!this.state.isCaptchaLoaded && <div className="loading-3balls"></div>}
                      <Recaptcha
                        elementID="g-recaptcha"
                        className={`captcha${this.state.isCaptchaLoaded ? "" : "-hide"}`}
                        sitekey="6LfTVn8UAAAAAIBzOyB1DRE5p-qWVav4vuZM53co"
                        ref={e => this.recaptchaInstance = e}
                        verifyCallback={this.verifyCallback}
                        onloadCallback={this.onloadCallback}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="overlap promo-btn">
                <button onClick={this.closeModal.bind(this)} className= {`button accent cur-pointer cancel-buttom`}>
                  {this.props.translate("import.cancel") || "Cancel"}
                </button>
                <button className= {`button accent cur-pointer ${this.state.isPassCapcha ? "": "disable"}`} onClick={this.apply.bind(this)}>
                  {this.props.translate("import.apply") || "Apply"}
                </button>
              </div>
            </div>
          }
        />
      </div>
    )
  }
}
