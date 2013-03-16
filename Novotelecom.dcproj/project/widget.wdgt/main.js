apiUrl = "https://api.novotelecom.ru/billing/?method=userInfo&login=%CONTRACT_ID%&passwordHash=%PASSWORD_HASH%";
errors = ['успех', 'неверный логин или пароль', 'внутреняя ошибка', 'вызываемый метод не найден'];
updateInterval = 60 * 60 * 1000;    // 1 hour
passwordMask = "";



function DashboardPreferences() {
    this.setContractId = function (contractId) {
        this._setPreference("contractId", contractId);
    }
    
    this.setPassword = function (password) {
        this._setPreference("passwordHash", md5(password));
    }
    
    this.getContractId = function () {
        return this._getPreference("contractId");
    }
    
    this.getPassword = this.getPasswordHash = function () {
        return this._getPreference("passwordHash");
    }
    
    this.clear = function (contractId) {
        this.setContractId(undefined);
        this.setPassword(undefined);
    }
	
	this.setRecentResponse = function (response) {
		this._setPreference("recentUsername", response.username);
		this._setPreference("recentContractId", response.contractId);
		this._setPreference("recentBalance", response.balance);
		this._setPreference("recentDaysLeft", response.daysLeft);
		this._setPreference("recentBound", response.bound);
	}
	
	this.getRecentResponse = function () {
		response = new Object();
		response.username = this._getPreference("recentUsername");
		response.contractId = this._getPreference("recentContractId");
		response.balance = this._getPreference("recentBalance");
		response.daysLeft = this._getPreference("recentDaysLeft");
		response.bound = this._getPreference("recentBound");
        return response;
    }
    
    this._getPreference = function (preference) {
        return widget.preferenceForKey(widget.identifier + "-" + preference);
    }
    
    this._setPreference = function (preference, value) {
        if (value != undefined)
            widget.setPreferenceForKey(value, widget.identifier + "-" + preference);
    }
}



function DashboardViewModel() {

    this.setContractId = function (contractId) {
        this._setTextProperty("contractIdText", "Договор №" + contractId);
        this._setFieldProperty("contractIdTextField", contractId);
    }
    
    this.setPassword = function (ignorable) {
        this._setFieldProperty("passwordTextField", passwordMask);
    }
    
    this.setUsername = function (username) {
        this._setTextProperty("usernameText", username);
    }
    
    this.setBalance = function (balance) {
        this._setTextProperty("balanceText", parseFloat(balance).toFixed(2) + " рублей");
    }
    
    this.setDaysLeft = function (days) {
        this._setTextProperty("daysLeftText", days);
    }
    
    this.setBound = function (bound) {
        this._setTextProperty("boundText", "Порог отключения: " + bound + " рублей");
    }
    
    this.getContractId = function () {
        return this._getProperty("contractIdTextField");
    }
    
    this.getPassword = function () {
        var password = this._getProperty("passwordTextField");
        if (password == passwordMask) return undefined;
        return password;
    }
    
    this.errorMessage = function(message) {
            alert(message);
            this.setUsername("\nОшибка!");
            this._setTextProperty("contractIdText", "");
            this._setTextProperty("balanceText", "");
            this._setTextProperty("daysLeftText",  message);
            this._setTextProperty("boundText", "");
    }
    
    this.notifyModelChanged = function (response) {
        if (response.error != undefined) {
            this.errorMessage(response.error);
        } else {
            this.syncFromResponse(response);        
		}
    }
	
	this.syncFromResponse = function (response) {
        if (response != undefined && response.error == undefined && response.username != undefined) {
            this.setUsername(response.username);
            this.setContractId(response.contractId);
            this.setBalance(response.balance);
            this.setDaysLeft(response.daysLeft);
            this.setBound(response.bound);
        }
    }
    
    this._getProperty = function (property) {
        return document.getElementById(property).value;
    }
    
    this._setTextProperty = function (property, value) {
        if (value == undefined) return;
        document.getElementById(property).innerText = value;
    }
    this._setFieldProperty = function (property, value) {
        if (value == undefined) return;
        document.getElementById(property).value = value;
    }
}



function NovotelecomApi(contractId, passwordHash) {
    this.url = apiUrl.replace("%CONTRACT_ID%", contractId).replace("%PASSWORD_HASH%", passwordHash);
	
	if (contractId == "") {
		this.executeRequest = function() {}
		return;
	}
	
    this.executeRequest = function() {
        xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = this._parseResponse.bind(this);
        xmlHttp.overrideMimeType('text/xml');
        xmlHttp.open("GET", this.url, true);
        xmlHttp.send();
    }
    
    this._parseResponse = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
            if (xmlHttp.responseXML != null) {
                var response = new Object();
                var errorCode = xmlHttp.responseXML.getElementsByTagName("errorCode")[0].firstChild.nodeValue;
                if (errorCode != 0) {
                    response.error = errors[parseInt(errorCode)];
                } else {
                    response.contractId = xmlHttp.responseXML.getElementsByTagName("contractId")[0].firstChild.nodeValue;
                    response.username = xmlHttp.responseXML.getElementsByTagName("name")[0].firstChild.nodeValue;
                    response.balance = xmlHttp.responseXML.getElementsByTagName("balance")[0].firstChild.nodeValue;
                    response.daysLeft = xmlHttp.responseXML.getElementsByTagName("days2BlockStr")[0].firstChild.nodeValue;
                    response.bound = xmlHttp.responseXML.getElementsByTagName("debetBound")[0].firstChild.nodeValue;
					dashboard.preferences.setRecentResponse(response);
                }
                if (typeof this.onModelChanged == "function")
                    this.onModelChanged(response);
            }                    
        }
    }
}


function DashboardController() {

    this.preferences = new DashboardPreferences();
    
    this.viewModel = new DashboardViewModel();
    
    this.start = function() {
		var isPrefsLoaded = this.loadPreferences();
        if(!isPrefsLoaded) {
            showBack();
        }
            
        this._addEventHandlers();
		this.viewModel.syncFromResponse(this.preferences.getRecentResponse());
        this.viewModel.setContractId(this.preferences.getContractId());
        this.viewModel.setPassword("");//this.preferences.getPasswordHash());
		var pwd = isPrefsLoaded ? this.preferences.getPasswordHash() : md5(this.viewModel.getPassword());
        this._api = new NovotelecomApi(this.viewModel.getContractId(), pwd);
        this._api.onModelChanged = this.viewModel.notifyModelChanged.bind(this.viewModel);
        this._startTimer();
    }
    
    this.applyPreferences = function() {
        this._api = new NovotelecomApi(this.viewModel.getContractId(), md5(this.viewModel.getPassword()));
        this._api.onModelChanged = this.viewModel.notifyModelChanged.bind(this.viewModel);
        this.storePreferences();
        this._startTimer();
    }
    
    this.storePreferences = function() {
        this._copyPreferences(this.viewModel, this.preferences);
    }
    
    this.loadPreferences = function() {
        this._copyPreferences(this.preferences, this.viewModel);
        return this.preferences.getContractId() != undefined;
    }
    
    this._startTimer = function(msec) {
        if (msec == undefined)
            msec = 0;
        this._updateTimer = setTimeout("dashboard._refreshModel()", msec);
    }
    
    this._stopTimer = function() {
        clearTimeout(this._updateTimer);
    }
    
    this._refreshModel = function() {
        this._api.executeRequest();
        this._startTimer(updateInterval);
    }
    
    this._copyPreferences = function(source, destination) {
        destination.setContractId(source.getContractId());
        destination.setPassword(source.getPassword());
    }
    
    this._addEventHandlers = function() {
        if (window.widget) {
            widget.onshow = dashboard._startTimer;
            widget.onremove = function() {
                widget.onhide();
                dashboard.preferences.clear();
            }
            widget.onhide = this._stopTimer;
            widget.onsync = this.loadPreferences;
        }
    }
}

dashboard = new DashboardController();

function load()
{
    dashcode.setupParts();
    dashboard.start();
    
}

function showBack(event)
{
    var front = document.getElementById("front");
    var back = document.getElementById("back");

    if (window.widget) {
        widget.prepareForTransition("ToBack");
    }

    front.style.display = "none";
    back.style.display = "block";

    if (window.widget) {
        setTimeout(function () {
            widget.performTransition();
        }, 0);
		setTimeout(function() { document.getElementById("contractIdTextField").focus(); }, 1000);
    }
}

function showFront(event)
{
    dashboard.applyPreferences();
    var front = document.getElementById("front");
    var back = document.getElementById("back");

    if (window.widget) {
        widget.prepareForTransition("ToFront");
    }

    front.style.display="block";
    back.style.display="none";

    if (window.widget) {
        setTimeout('widget.performTransition();', 0);
    }
}



//*****************************************************************************************************
// MD5 hash-function's implementation
//*****************************************************************************************************

function md5cycle(x, k) {
var a = x[0], b = x[1], c = x[2], d = x[3];

a = ff(a, b, c, d, k[0], 7, -680876936);
d = ff(d, a, b, c, k[1], 12, -389564586);
c = ff(c, d, a, b, k[2], 17,  606105819);
b = ff(b, c, d, a, k[3], 22, -1044525330);
a = ff(a, b, c, d, k[4], 7, -176418897);
d = ff(d, a, b, c, k[5], 12,  1200080426);
c = ff(c, d, a, b, k[6], 17, -1473231341);
b = ff(b, c, d, a, k[7], 22, -45705983);
a = ff(a, b, c, d, k[8], 7,  1770035416);
d = ff(d, a, b, c, k[9], 12, -1958414417);
c = ff(c, d, a, b, k[10], 17, -42063);
b = ff(b, c, d, a, k[11], 22, -1990404162);
a = ff(a, b, c, d, k[12], 7,  1804603682);
d = ff(d, a, b, c, k[13], 12, -40341101);
c = ff(c, d, a, b, k[14], 17, -1502002290);
b = ff(b, c, d, a, k[15], 22,  1236535329);

a = gg(a, b, c, d, k[1], 5, -165796510);
d = gg(d, a, b, c, k[6], 9, -1069501632);
c = gg(c, d, a, b, k[11], 14,  643717713);
b = gg(b, c, d, a, k[0], 20, -373897302);
a = gg(a, b, c, d, k[5], 5, -701558691);
d = gg(d, a, b, c, k[10], 9,  38016083);
c = gg(c, d, a, b, k[15], 14, -660478335);
b = gg(b, c, d, a, k[4], 20, -405537848);
a = gg(a, b, c, d, k[9], 5,  568446438);
d = gg(d, a, b, c, k[14], 9, -1019803690);
c = gg(c, d, a, b, k[3], 14, -187363961);
b = gg(b, c, d, a, k[8], 20,  1163531501);
a = gg(a, b, c, d, k[13], 5, -1444681467);
d = gg(d, a, b, c, k[2], 9, -51403784);
c = gg(c, d, a, b, k[7], 14,  1735328473);
b = gg(b, c, d, a, k[12], 20, -1926607734);

a = hh(a, b, c, d, k[5], 4, -378558);
d = hh(d, a, b, c, k[8], 11, -2022574463);
c = hh(c, d, a, b, k[11], 16,  1839030562);
b = hh(b, c, d, a, k[14], 23, -35309556);
a = hh(a, b, c, d, k[1], 4, -1530992060);
d = hh(d, a, b, c, k[4], 11,  1272893353);
c = hh(c, d, a, b, k[7], 16, -155497632);
b = hh(b, c, d, a, k[10], 23, -1094730640);
a = hh(a, b, c, d, k[13], 4,  681279174);
d = hh(d, a, b, c, k[0], 11, -358537222);
c = hh(c, d, a, b, k[3], 16, -722521979);
b = hh(b, c, d, a, k[6], 23,  76029189);
a = hh(a, b, c, d, k[9], 4, -640364487);
d = hh(d, a, b, c, k[12], 11, -421815835);
c = hh(c, d, a, b, k[15], 16,  530742520);
b = hh(b, c, d, a, k[2], 23, -995338651);

a = ii(a, b, c, d, k[0], 6, -198630844);
d = ii(d, a, b, c, k[7], 10,  1126891415);
c = ii(c, d, a, b, k[14], 15, -1416354905);
b = ii(b, c, d, a, k[5], 21, -57434055);
a = ii(a, b, c, d, k[12], 6,  1700485571);
d = ii(d, a, b, c, k[3], 10, -1894986606);
c = ii(c, d, a, b, k[10], 15, -1051523);
b = ii(b, c, d, a, k[1], 21, -2054922799);
a = ii(a, b, c, d, k[8], 6,  1873313359);
d = ii(d, a, b, c, k[15], 10, -30611744);
c = ii(c, d, a, b, k[6], 15, -1560198380);
b = ii(b, c, d, a, k[13], 21,  1309151649);
a = ii(a, b, c, d, k[4], 6, -145523070);
d = ii(d, a, b, c, k[11], 10, -1120210379);
c = ii(c, d, a, b, k[2], 15,  718787259);
b = ii(b, c, d, a, k[9], 21, -343485551);

x[0] = add32(a, x[0]);
x[1] = add32(b, x[1]);
x[2] = add32(c, x[2]);
x[3] = add32(d, x[3]);

}

function cmn(q, a, b, x, s, t) {
a = add32(add32(a, q), add32(x, t));
return add32((a << s) | (a >>> (32 - s)), b);
}

function ff(a, b, c, d, x, s, t) {
return cmn((b & c) | ((~b) & d), a, b, x, s, t);
}

function gg(a, b, c, d, x, s, t) {
return cmn((b & d) | (c & (~d)), a, b, x, s, t);
}

function hh(a, b, c, d, x, s, t) {
return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(a, b, c, d, x, s, t) {
return cmn(c ^ (b | (~d)), a, b, x, s, t);
}

function md51(s) {
if(s == undefined)
    s = passwordMask;
txt = '';
var n = s.length,
state = [1732584193, -271733879, -1732584194, 271733878], i;
for (i=64; i<=s.length; i+=64) {
md5cycle(state, md5blk(s.substring(i-64, i)));
}
s = s.substring(i-64);
var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
for (i=0; i<s.length; i++)
tail[i>>2] |= s.charCodeAt(i) << ((i%4) << 3);
tail[i>>2] |= 0x80 << ((i%4) << 3);
if (i > 55) {
md5cycle(state, tail);
for (i=0; i<16; i++) tail[i] = 0;
}
tail[14] = n*8;
md5cycle(state, tail);
return state;
}

/* there needs to be support for Unicode here,
 * unless we pretend that we can redefine the MD-5
 * algorithm for multi-byte characters (perhaps
 * by adding every four 16-bit characters and
 * shortening the sum to 32 bits). Otherwise
 * I suggest performing MD-5 as if every character
 * was two bytes--e.g., 0040 0025 = @%--but then
 * how will an ordinary MD-5 sum be matched?
 * There is no way to standardize text to something
 * like UTF-8 before transformation; speed cost is
 * utterly prohibitive. The JavaScript standard
 * itself needs to look at this: it should start
 * providing access to strings as preformed UTF-8
 * 8-bit unsigned value arrays.
 */
function md5blk(s) { /* I figured global was faster.   */
var md5blks = [], i; /* Andy King said do it this way. */
for (i=0; i<64; i+=4) {
md5blks[i>>2] = s.charCodeAt(i)
+ (s.charCodeAt(i+1) << 8)
+ (s.charCodeAt(i+2) << 16)
+ (s.charCodeAt(i+3) << 24);
}
return md5blks;
}

var hex_chr = '0123456789abcdef'.split('');

function rhex(n)
{
var s='', j=0;
for(; j<4; j++)
s += hex_chr[(n >> (j * 8 + 4)) & 0x0F]
+ hex_chr[(n >> (j * 8)) & 0x0F];
return s;
}

function hex(x) {
for (var i=0; i<x.length; i++)
x[i] = rhex(x[i]);
return x.join('');
}

function md5(s) {
return hex(md51(s));
}

/* this function is much faster,
so if possible we use it. Some IEs
are the only ones I know of that
need the idiotic second function,
generated by an if clause.  */

function add32(a, b) {
return (a + b) & 0xFFFFFFFF;
}

if (md5('hello') != '5d41402abc4b2a76b9719d911017c592') {
function add32(x, y) {
var lsw = (x & 0xFFFF) + (y & 0xFFFF),
msw = (x >> 16) + (y >> 16) + (lsw >> 16);
return (msw << 16) | (lsw & 0xFFFF);
}
}