/**
 * dsh-remote-mobile 客户端运行时 Bundle
 * 由 scripts/build-client.js 基于 esbuild 自动化编译打包，请勿直接手动修改此文件！
 * 源码请移步 src/client/ 目录进行模块化开发与维护。
 */
window.__ModuleLoader__.load({
  id: "dsh-remote-mobile",
  factory: function(require) {
    var module = { exports: {} };
    var exports = module.exports;

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.jsx
var index_exports = {};
__export(index_exports, {
  TailscaleMobileSection: () => TailscaleMobileSection,
  apply: () => apply,
  default: () => index_default,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react10 = __toESM(require("react"), 1);

// src/client/components/MainSection.jsx
var import_react9 = __toESM(require("react"), 1);

// src/client/api.js
function fetchStatus() {
  return fetch("/api/remote-mobile/status?_t=" + Date.now()).then(function(res) {
    return res.json();
  });
}
function generatePairCode() {
  return fetch("/api/remote-mobile/generate-code", { method: "POST" }).then(function(res) {
    return res.json();
  });
}
function updateBypassConfig(allowTailscale, allowLan) {
  return fetch("/api/remote-mobile/update-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowTailscale, allowLan })
  }).then(function(res) {
    return res.json();
  });
}
function updateAdvancedSecurityOptions(payload) {
  return fetch("/api/remote-mobile/update-options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function(res) {
    return res.json();
  });
}
function updateSecret(secret) {
  return fetch("/api/remote-mobile/set-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret })
  }).then(function(res) {
    return res.json();
  });
}
function clearSecretApi() {
  return fetch("/api/remote-mobile/clear-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }).then(function(res) {
    return res.json();
  });
}
function revokeDeviceApi(token) {
  return fetch("/api/remote-mobile/revoke-device", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  }).then(function(res) {
    return res.json();
  });
}
function revokeAllDevicesApi() {
  return fetch("/api/remote-mobile/revoke-all", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }).then(function(res) {
    return res.json();
  });
}
function unlockIpApi(ip) {
  return fetch("/api/remote-mobile/unlock-ip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip })
  }).then(function(res) {
    return res.json();
  });
}
function clearIpStatsApi() {
  return fetch("/api/remote-mobile/clear-ip-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }).then(function(res) {
    return res.json();
  });
}
function fetchStyles() {
  return fetch("/api/remote-mobile/styles?_t=" + Date.now()).then(function(res) {
    return res.json();
  });
}
function saveStyleSnippet(payload) {
  return fetch("/api/remote-mobile/styles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }).then(function(res) {
    return res.json();
  });
}
function toggleStyleApi(id, scope, enabled) {
  return fetch("/api/remote-mobile/styles/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, scope, enabled })
  }).then(function(res) {
    return res.json();
  });
}
function deleteStyleSnippetApi(id) {
  return fetch("/api/remote-mobile/styles/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  }).then(function(res) {
    return res.json();
  });
}
function resetStylesApi() {
  return fetch("/api/remote-mobile/styles/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }).then(function(res) {
    return res.json();
  });
}

// src/client/qrcode.js
var generateQrSvg = (function() {
  var PAD0 = 236, PAD1 = 17;
  function QRCodeModel(typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }
  QRCodeModel.prototype = {
    addData: function(data) {
      this.dataList.push(new QR8bitByte(data));
      this.dataCache = null;
    },
    isDark: function(row, col) {
      if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) throw new Error(row + "," + col);
      return this.modules[row][col];
    },
    getModuleCount: function() {
      return this.moduleCount;
    },
    make: function() {
      if (this.typeNumber < 1) {
        var typeNumber = 1;
        for (typeNumber = 1; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
          var buffer = new QRBitBuffer();
          var totalDataCount = 0;
          for (var i2 = 0; i2 < rsBlocks.length; i2++) totalDataCount += rsBlocks[i2].dataCount;
          for (var i2 = 0; i2 < this.dataList.length; i2++) {
            var data = this.dataList[i2];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
            data.write(buffer);
          }
          if (buffer.getLengthInBits() <= totalDataCount * 8) break;
        }
        this.typeNumber = typeNumber;
      }
      this.makeImpl(false, this.getBestMaskPattern());
    },
    makeImpl: function(test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = new Array(this.moduleCount);
      for (var row = 0; row < this.moduleCount; row++) {
        this.modules[row] = new Array(this.moduleCount);
        for (var col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
      }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern();
      this.setupTimingPattern();
      this.setupTypeInfo(test, maskPattern);
      if (this.typeNumber >= 7) this.setupTypeNumber(test);
      if (this.dataCache == null) this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
      this.mapData(this.dataCache, maskPattern);
    },
    setupPositionProbePattern: function(row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          if (0 <= r && r <= 6 && (c == 0 || c == 6) || 0 <= c && c <= 6 && (r == 0 || r == 6) || 2 <= r && r <= 4 && 2 <= c && c <= 4) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    getBestMaskPattern: function() {
      var minLostPoint = 0, pattern = 0;
      for (var i2 = 0; i2 < 8; i2++) {
        this.makeImpl(true, i2);
        var lostPoint = QRUtil.getLostPoint(this);
        if (i2 == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i2;
        }
      }
      return pattern;
    },
    setupTimingPattern: function() {
      for (var r = 8; r < this.moduleCount - 8; r++) {
        if (this.modules[r][6] !== null) continue;
        this.modules[r][6] = r % 2 == 0;
      }
      for (var c = 8; c < this.moduleCount - 8; c++) {
        if (this.modules[6][c] !== null) continue;
        this.modules[6][c] = c % 2 == 0;
      }
    },
    setupPositionAdjustPattern: function() {
      var pos = QRUtil.getPatternPosition(this.typeNumber);
      for (var i2 = 0; i2 < pos.length; i2++) {
        for (var j = 0; j < pos.length; j++) {
          var row = pos[i2], col = pos[j];
          if (this.modules[row][col] !== null) continue;
          for (var r = -2; r <= 2; r++) {
            for (var c = -2; c <= 2; c++) {
              if (r == -2 || r == 2 || c == -2 || c == 2 || r == 0 && c == 0) this.modules[row + r][col + c] = true;
              else this.modules[row + r][col + c] = false;
            }
          }
        }
      }
    },
    setupTypeNumber: function(test) {
      var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
      for (var i2 = 0; i2 < 18; i2++) {
        var mod = !test && (bits >> i2 & 1) == 1;
        this.modules[Math.floor(i2 / 3)][i2 % 3 + this.moduleCount - 8 - 3] = mod;
        this.modules[i2 % 3 + this.moduleCount - 8 - 3][Math.floor(i2 / 3)] = mod;
      }
    },
    setupTypeInfo: function(test, maskPattern) {
      var data = this.errorCorrectLevel << 3 | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);
      for (var i2 = 0; i2 < 15; i2++) {
        var mod = !test && (bits >> i2 & 1) == 1;
        if (i2 < 6) this.modules[i2][8] = mod;
        else if (i2 < 8) this.modules[i2 + 1][8] = mod;
        else this.modules[this.moduleCount - 15 + i2][8] = mod;
        if (i2 < 8) this.modules[8][this.moduleCount - i2 - 1] = mod;
        else if (i2 < 9) this.modules[8][15 - i2 - 1 + 1] = mod;
        else this.modules[8][15 - i2 - 1] = mod;
      }
      this.modules[this.moduleCount - 8][8] = !test;
    },
    mapData: function(data, maskPattern) {
      var inc = -1, row = this.moduleCount - 1, bitIndex = 7, byteIndex = 0;
      for (var col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col == 6) col--;
        while (true) {
          for (var c = 0; c < 2; c++) {
            if (this.modules[row][col - c] === null) {
              var dark = false;
              if (byteIndex < data.length) dark = (data[byteIndex] >>> bitIndex & 1) == 1;
              var mask = QRUtil.getMask(maskPattern, row, col - c);
              if (mask) dark = !dark;
              this.modules[row][col - c] = dark;
              bitIndex--;
              if (bitIndex == -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
  };
  QRCodeModel.createData = function(typeNumber, errorCorrectLevel, dataList) {
    var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    var buffer = new QRBitBuffer();
    for (var i2 = 0; i2 < dataList.length; i2++) {
      var data = dataList[i2];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber));
      data.write(buffer);
    }
    var totalDataCount = 0;
    for (var i2 = 0; i2 < rsBlocks.length; i2++) totalDataCount += rsBlocks[i2].dataCount;
    if (buffer.getLengthInBits() > totalDataCount * 8) throw new Error("code length overflow");
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.getLengthInBits() % 8 != 0) buffer.putBit(false);
    while (true) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(PAD0, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(PAD1, 8);
    }
    return QRCodeModel.createBytes(buffer, rsBlocks);
  };
  QRCodeModel.createBytes = function(buffer, rsBlocks) {
    var offset = 0, maxDcCount = 0, maxEcCount = 0;
    var dcdata = new Array(rsBlocks.length), ecdata = new Array(rsBlocks.length);
    for (var r = 0; r < rsBlocks.length; r++) {
      var dcCount = rsBlocks[r].dataCount, ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (var i2 = 0; i2 < dcdata[r].length; i2++) dcdata[r][i2] = 255 & buffer.buffer[i2 + offset];
      offset += dcCount;
      var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
      var modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (var i2 = 0; i2 < ecdata[r].length; i2++) {
        var modIndex = i2 + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i2] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }
    var totalCodeCount = 0;
    for (var i2 = 0; i2 < rsBlocks.length; i2++) totalCodeCount += rsBlocks[i2].totalCount;
    var data = new Array(totalCodeCount), index = 0;
    for (var i2 = 0; i2 < maxDcCount; i2++) {
      for (var r = 0; r < rsBlocks.length; r++) {
        if (i2 < dcdata[r].length) data[index++] = dcdata[r][i2];
      }
    }
    for (var i2 = 0; i2 < maxEcCount; i2++) {
      for (var r = 0; r < rsBlocks.length; r++) {
        if (i2 < ecdata[r].length) data[index++] = ecdata[r][i2];
      }
    }
    return data;
  };
  function QR8bitByte(data) {
    this.mode = 4;
    this.data = data;
    this.parsedData = [];
    for (var i2 = 0, l = this.data.length; i2 < l; i2++) {
      var byteArray = [], code = this.data.charCodeAt(i2);
      if (code > 65536) {
        byteArray[0] = 240 | (code & 1835008) >>> 18;
        byteArray[1] = 128 | (code & 258048) >>> 12;
        byteArray[2] = 128 | (code & 4032) >>> 6;
        byteArray[3] = 128 | code & 63;
      } else if (code > 2048) {
        byteArray[0] = 224 | (code & 61440) >>> 12;
        byteArray[1] = 128 | (code & 4032) >>> 6;
        byteArray[2] = 128 | code & 63;
      } else if (code > 127) {
        byteArray[0] = 192 | (code & 1984) >>> 6;
        byteArray[1] = 128 | code & 63;
      } else {
        byteArray[0] = code;
      }
      this.parsedData.push(byteArray);
    }
    this.parsedData = Array.prototype.concat.apply([], this.parsedData);
    if (this.parsedData.length != this.data.length) this.parsedData.unshift(191, 187, 239);
  }
  QR8bitByte.prototype = {
    getLength: function() {
      return this.parsedData.length;
    },
    write: function(buffer) {
      for (var i2 = 0, l = this.parsedData.length; i2 < l; i2++) buffer.put(this.parsedData[i2], 8);
    }
  };
  var QRUtil = {
    PATTERN_POSITION_TABLE: [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ],
    G15: 1 << 10 | 1 << 8 | 1 << 5 | 1 << 4 | 1 << 2 | 1 << 1 | 1 << 0,
    G18: 1 << 12 | 1 << 11 | 1 << 10 | 1 << 9 | 1 << 8 | 1 << 5 | 1 << 2 | 1 << 0,
    G15_MASK: 1 << 14 | 1 << 12 | 1 << 10 | 1 << 4 | 1 << 1,
    getBCHTypeInfo: function(data) {
      var d = data << 10;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
        d ^= QRUtil.G15 << QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15);
      }
      return (data << 10 | d) ^ QRUtil.G15_MASK;
    },
    getBCHTypeNumber: function(data) {
      var d = data << 12;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
        d ^= QRUtil.G18 << QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18);
      }
      return data << 12 | d;
    },
    getBCHDigit: function(data) {
      var digit = 0;
      while (data != 0) {
        digit++;
        data >>>= 1;
      }
      return digit;
    },
    getPatternPosition: function(typeNumber) {
      return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },
    getMask: function(maskPattern, i2, j) {
      switch (maskPattern) {
        case 0:
          return (i2 + j) % 2 == 0;
        case 1:
          return i2 % 2 == 0;
        case 2:
          return j % 3 == 0;
        case 3:
          return (i2 + j) % 3 == 0;
        case 4:
          return (Math.floor(i2 / 2) + Math.floor(j / 3)) % 2 == 0;
        case 5:
          return i2 * j % 2 + i2 * j % 3 == 0;
        case 6:
          return (i2 * j % 2 + i2 * j % 3) % 2 == 0;
        case 7:
          return (i2 * j % 3 + (i2 + j) % 2) % 2 == 0;
        default:
          throw new Error("bad maskPattern:" + maskPattern);
      }
    },
    getErrorCorrectPolynomial: function(errorCorrectLength) {
      var a = new QRPolynomial([1], 0);
      for (var i2 = 0; i2 < errorCorrectLength; i2++) a = a.multiply(new QRPolynomial([1, QRMath.gexp(i2)], 0));
      return a;
    },
    getLengthInBits: function(mode, type) {
      if (1 <= type && type < 10) return 8;
      else if (type < 27) return 16;
      else if (type < 41) return 16;
      else throw new Error("type:" + type);
    },
    getLostPoint: function(qrCode) {
      var moduleCount = qrCode.getModuleCount(), lostPoint = 0;
      for (var row = 0; row < moduleCount; row++) {
        for (var col = 0; col < moduleCount; col++) {
          var sameCount = 0, dark = qrCode.isDark(row, col);
          for (var r = -1; r <= 1; r++) {
            if (row + r < 0 || moduleCount <= row + r) continue;
            for (var c = -1; c <= 1; c++) {
              if (col + c < 0 || moduleCount <= col + c) continue;
              if (r == 0 && c == 0) continue;
              if (dark == qrCode.isDark(row + r, col + c)) sameCount++;
            }
          }
          if (sameCount > 5) lostPoint += 3 + sameCount - 5;
        }
      }
      return lostPoint;
    }
  };
  var QRMath = {
    glog: function(n) {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: function(n) {
      while (n < 0) n += 255;
      while (n >= 256) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };
  for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (var i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;
  function QRPolynomial(num, shift) {
    if (num.length == void 0) throw new Error(num.length + "/" + shift);
    var offset = 0;
    while (offset < num.length && num[offset] == 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i2 = 0; i2 < num.length - offset; i2++) this.num[i2] = num[i2 + offset];
  }
  QRPolynomial.prototype = {
    get: function(index) {
      return this.num[index];
    },
    getLength: function() {
      return this.num.length;
    },
    multiply: function(e) {
      var num = new Array(this.getLength() + e.getLength() - 1);
      for (var i2 = 0; i2 < this.getLength(); i2++) {
        for (var j = 0; j < e.getLength(); j++) num[i2 + j] ^= QRMath.gexp(QRMath.glog(this.get(i2)) + QRMath.glog(e.get(j)));
      }
      return new QRPolynomial(num, 0);
    },
    mod: function(e) {
      if (this.getLength() - e.getLength() < 0) return this;
      var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      var num = new Array(this.getLength());
      for (var i2 = 0; i2 < this.getLength(); i2++) num[i2] = this.get(i2);
      for (var i2 = 0; i2 < e.getLength(); i2++) num[i2] ^= QRMath.gexp(QRMath.glog(e.get(i2)) + ratio);
      return new QRPolynomial(num, 0).mod(e);
    }
  };
  function QRRSBlock(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
  }
  QRRSBlock.RS_BLOCK_TABLE = [
    [1, 26, 19],
    [1, 26, 16],
    [1, 26, 13],
    [1, 26, 9],
    [1, 44, 34],
    [1, 44, 28],
    [1, 44, 22],
    [1, 44, 16],
    [1, 70, 55],
    [1, 70, 44],
    [2, 35, 17],
    [2, 35, 13],
    [1, 100, 80],
    [2, 50, 32],
    [2, 50, 24],
    [4, 25, 9]
  ];
  QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
    var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
    if (rsBlock == void 0) throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
    var length = rsBlock.length / 3, list = [];
    for (var i2 = 0; i2 < length; i2++) {
      var count = rsBlock[i2 * 3 + 0], totalCount = rsBlock[i2 * 3 + 1], dataCount = rsBlock[i2 * 3 + 2];
      for (var j = 0; j < count; j++) list.push(new QRRSBlock(totalCount, dataCount));
    }
    return list;
  };
  QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
    switch (errorCorrectLevel) {
      case 1:
        return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case 0:
        return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case 3:
        return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case 2:
        return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default:
        return void 0;
    }
  };
  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  QRBitBuffer.prototype = {
    get: function(index) {
      return (this.buffer[Math.floor(index / 8)] >>> 7 - index % 8 & 1) == 1;
    },
    put: function(num, length) {
      for (var i2 = 0; i2 < length; i2++) this.putBit((num >>> length - i2 - 1 & 1) == 1);
    },
    getLengthInBits: function() {
      return this.length;
    },
    putBit: function(bit) {
      var bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex] |= 128 >>> this.length % 8;
      this.length++;
    }
  };
  return function(text, size) {
    size = size || 180;
    var qr = new QRCodeModel(0, 1);
    qr.addData(text);
    qr.make();
    var count = qr.getModuleCount();
    var margin = 2;
    var total = count + margin * 2;
    var cellSize = size / total;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '" style="border-radius:12px;background:#ffffff;">';
    svg += '<rect width="100%" height="100%" fill="#ffffff"/>';
    svg += '<g fill="#0f172a">';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          var x = ((c + margin) * cellSize).toFixed(2);
          var y = ((r + margin) * cellSize).toFixed(2);
          var w = (cellSize + 0.3).toFixed(2);
          svg += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '"/>';
        }
      }
    }
    svg += "</g></svg>";
    return svg;
  };
})();

// src/client/components/NetworkCard.jsx
var import_react = __toESM(require("react"), 1);

// src/client/i18n.js
var translations = {
  zh: {
    // 主面板
    title: "\u8FDC\u7A0B\u4E0E\u79FB\u52A8\u7AEF",
    subtitle: "\u652F\u6301 Tailscale \u865A\u62DF\u79C1\u7F51\u4E0E\u672C\u5730\u5C40\u57DF\u7F51 (Wi-Fi) \u63A5\u5165\uFF0C\u63D0\u4F9B\u626B\u7801\u5FEB\u901F\u914D\u5BF9\u4E0E\u957F\u671F\u8BBF\u95EE\u5BC6\u7801\u3002",
    // 卡片 1: 网络与直连
    netCardTitle: "\u7F51\u7EDC\u63A5\u5165\u5730\u5740\u4E0E\u514D\u5BC6\u76F4\u8FDE\u7BA1\u7406",
    netCardDesc: "\u5728\u624B\u673A\u6D4F\u89C8\u5668\u4E2D\u76F4\u63A5\u8F93\u5165\u4E0B\u5217\u5730\u5740\uFF0C\u6216\u901A\u8FC7\u4E0B\u65B9\u4E8C\u7EF4\u7801\u626B\u7801\u914D\u5BF9\u3002\u82E5\u60A8\u5904\u4E8E\u53EF\u4FE1\u5B89\u5168\u7F51\u7EDC\u73AF\u5883\u4E2D\uFF0C\u53EF\u5F00\u542F\u514D\u5BC6\u76F4\u8FDE\u529F\u80FD\u3002",
    tailscaleSectionTitle: "Tailscale \u865A\u62DF\u79C1\u7F51\u63A5\u5165 (\u63A8\u8350)",
    tailscaleBadge: "Tailscale IP",
    tailscaleNotConnected: "\u672A\u68C0\u6D4B\u5230 Tailscale \u865A\u62DF\u79C1\u7F51 IP",
    tailscaleGuide: "\u8BF7\u786E\u4FDD\u672C\u673A\u5DF2\u5B89\u88C5\u5E76\u767B\u5F55 Tailscale\u3002\u901A\u8FC7\u865A\u62DF\u79C1\u7F51\u8BBF\u95EE\u65E2\u5B89\u5168\u53C8\u65E0\u9700\u516C\u7F51\u6620\u5C04\u3002",
    lanSectionTitle: "\u672C\u5730\u5C40\u57DF\u7F51\u63A5\u5165 (LAN / Wi-Fi)",
    lanBadge: "\u5C40\u57DF\u7F51 IP",
    lanNotConnected: "\u672A\u68C0\u6D4B\u5230\u53EF\u7528\u7684\u672C\u5730\u5C40\u57DF\u7F51 IP",
    copyUrlBtn: "\u{1F4CB} \u590D\u5236\u94FE\u63A5",
    copiedTip: "\u5DF2\u6210\u529F\u590D\u5236\u94FE\u63A5\u5230\u526A\u8D34\u677F\uFF01",
    directBypassToggle: "\u514D\u5BC6\u76F4\u8FDE\u6A21\u5F0F (\u76F4\u8FBE\u9875\u9762)",
    directBypassOn: "\u5DF2\u5F00\u542F\u514D\u5BC6\u76F4\u8FDE",
    directBypassOff: "\u5DF2\u5173\u95ED\u514D\u5BC6\u76F4\u8FDE",
    tailscaleBypassDesc: "\u5F00\u542F\u540E\uFF0C\u6240\u6709\u901A\u8FC7 Tailscale \u79C1\u7F51\u8BBF\u95EE\u7684\u8BBE\u5907\u65E0\u9700\u8F93\u5165\u5BC6\u7801\u6216\u914D\u5BF9\u7801\u5373\u53EF\u76F4\u63A5\u8FDB\u5165\u63A7\u5236\u53F0\uFF08\u63A8\u8350\u5728\u4E2A\u4EBA Tailnet \u79C1\u7F51\u4E2D\u5F00\u542F\uFF09\u3002",
    lanBypassWarningTitle: "\u{1F6A8} \u6781\u9AD8\u98CE\u9669\u8B66\u793A\uFF1A\u5C40\u57DF\u7F51\u514D\u5BC6\u63A7\u5236\u98CE\u9669",
    lanBypassDesc: "\u5F00\u542F\u5C40\u57DF\u7F51\u514D\u5BC6\u540E\uFF0C\u8FDE\u63A5\u540C\u4E00 Wi-Fi \u8DEF\u7531\u5668\u7684\u4EFB\u610F\u8BBE\u5907\uFF08\u5305\u62EC\u5BB6\u5EAD\u8BBF\u5BA2\u3001\u516C\u5171\u8E6D\u7F51\u8005\uFF09\u5747\u65E0\u9700\u5BC6\u7801\u5373\u53EF\u76F4\u63A5\u63A7\u5236\u548C\u6267\u884C\u672C\u670D\u52A1\uFF01\u5F3A\u70C8\u5EFA\u8BAE\u4EC5\u5728\u5B8C\u5168\u79C1\u6709\u53EF\u4FE1\u7684\u7F51\u7EDC\u4E2D\u8C28\u614E\u5F00\u542F\u3002",
    lanBypassConfirm: "\u3010\u{1F6A8} \u6781\u9AD8\u5B89\u5168\u98CE\u9669\u64CD\u4F5C\u786E\u8BA4\u3011\n\n\u786E\u5B9A\u8981\u5F00\u542F\u300C\u5C40\u57DF\u7F51\u514D\u5BC6\u76F4\u8FDE\u300D\u5417\uFF1F\n\n\u26A0\uFE0F \u5F00\u542F\u540E\u679C\uFF1A\n\u540C\u4E00 Wi-Fi \u4E0B\u7684\u4EFB\u4F55\u5176\u4ED6\u8BBE\u5907\uFF08\u624B\u673A/\u7535\u8111/\u8BBF\u5BA2\u8BBE\u5907\uFF09\u65E0\u9700\u8F93\u5165\u4EFB\u4F55\u5BC6\u7801\u6216\u914D\u5BF9\u7801\uFF0C\u5C31\u80FD\u76F4\u63A5\u63A5\u7BA1\u5E76\u63A7\u5236\u60A8\u7684 DSH \u5DE5\u4F5C\u533A\u4E0E\u7EC8\u7AEF\u670D\u52A1\uFF01\n\n\u8BF7\u52A1\u5FC5\u786E\u8BA4\u60A8\u5F53\u524D\u8FDE\u63A5\u7684\u662F\u5B8C\u5168\u53EF\u4FE1\u7684\u5BB6\u5EAD\u79C1\u6709 Wi-Fi\uFF0C\u5207\u52FF\u5728\u516C\u5171\u7F51\u7EDC\uFF08\u5496\u5561\u5385/\u9152\u5E97/\u516C\u53F8 Wi-Fi\uFF09\u4E2D\u5F00\u542F\uFF01",
    // 卡片 2: 配对码与二维码
    pairingCardTitle: "\u624B\u673A\u5FEB\u901F\u914D\u5BF9\u4E0E\u626B\u7801\u63A5\u5165",
    pairingCardDesc: "\u624B\u673A\u4E0E\u7535\u8111\u8FDE\u63A5\u540C\u4E00\u7F51\u7EDC\u540E\uFF0C\u4F7F\u7528\u624B\u673A\u5FAE\u4FE1\u6216\u76F8\u673A\u76F4\u63A5\u626B\u63CF\u4E0B\u65B9\u4E8C\u7EF4\u7801\uFF0C\u6216\u624B\u52A8\u8F93\u5165 6 \u4F4D\u77ED\u671F\u914D\u5BF9\u7801\u5373\u53EF\u5FEB\u901F\u5B8C\u6210\u8EAB\u4EFD\u6388\u6743\u4E0E\u8BBE\u5907\u7ED1\u5B9A\u3002",
    shortCodeTitle: "6 \u4F4D\u77ED\u671F\u52A8\u6001\u914D\u5BF9\u7801",
    codeValidUntil: "\u6709\u6548\u671F\u5269\u4F59\uFF1A",
    codeExpired: "\u914D\u5BF9\u7801\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u70B9\u51FB\u5237\u65B0\u91CD\u65B0\u751F\u6210",
    clickToReveal: "\u70B9\u51FB\u67E5\u770B 6 \u4F4D\u914D\u5BF9\u7801",
    clickToHide: "\u70B9\u51FB\u9690\u85CF",
    refreshCodeBtn: "\u{1F504} \u5237\u65B0\u914D\u5BF9\u7801",
    qrTitle: "\u626B\u7801\u514D\u8F93\u5BC6\u7801\u76F4\u8FDE",
    toggleQrShow: "\u663E\u793A\u914D\u5BF9\u4E8C\u7EF4\u7801",
    toggleQrHide: "\u6536\u8D77\u4E8C\u7EF4\u7801",
    switchTailscaleTab: "Tailscale \u626B\u7801",
    switchLanTab: "\u5C40\u57DF\u7F51 (Wi-Fi) \u626B\u7801",
    copyDirectAuthLink: "\u{1F4CB} \u590D\u5236\u5E26\u914D\u5BF9\u7801\u76F4\u94FE",
    // 卡片 3: 长期密码
    secretCardTitle: "\u8BBE\u7F6E\u957F\u671F\u8BBF\u95EE\u5BC6\u7801 (\u53EF\u9009)",
    secretCardDesc: "\u5982\u679C\u4E0D\u5E0C\u671B\u6BCF\u6B21\u4F7F\u7528 6 \u4F4D\u77ED\u671F\u914D\u5BF9\u7801\uFF0C\u53EF\u5728\u6B64\u8BBE\u7F6E\u4E00\u4E2A\u56FA\u5B9A\u5BC6\u7801\u3002\u5728\u624B\u673A\u7AEF\u8F93\u5165\u6B64\u5BC6\u7801\u4E5F\u53EF\u5B8C\u6210\u9A8C\u8BC1\u5E76\u6362\u53D6\u6301\u4E45\u6388\u6743\u3002",
    secretConfigured: "\u2705 \u5F53\u524D\u5DF2\u914D\u7F6E\u957F\u671F\u8BBF\u95EE\u5BC6\u7801 (\u5DF2\u5B89\u5168\u52A0\u76D0\u52A0\u5BC6\u843D\u76D8\u5B58\u50A8)",
    secretNotConfigured: "\u26AA \u5F53\u524D\u672A\u914D\u7F6E\u957F\u671F\u8BBF\u95EE\u5BC6\u7801 (\u4EC5\u80FD\u901A\u8FC7\u4E34\u65F6\u914D\u5BF9\u7801\u6388\u6743)",
    secretInputPlaceholder: "\u8BF7\u8F93\u5165 6 \u4F4D\u4EE5\u4E0A\u5B57\u6BCD\u4E0E\u6570\u5B57\u7EC4\u5408\u5BC6\u7801",
    secretInputLabel: "\u957F\u671F\u5BC6\u7801\uFF1A",
    showPassword: "\u{1F441}\uFE0F \u663E\u793A\u5BC6\u7801",
    hidePassword: "\u{1F648} \u9690\u85CF\u5BC6\u7801",
    saveSecretBtn: "\u{1F4BE} \u4FDD\u5B58\u5BC6\u7801",
    clearSecretBtn: "\u{1F5D1}\uFE0F \u6E05\u9664\u5BC6\u7801",
    secretWeakTip: "\u5BC6\u7801\u5FC5\u987B\u81F3\u5C11 6 \u4F4D\uFF0C\u4E14\u540C\u65F6\u5305\u542B\u5B57\u6BCD\u548C\u6570\u5B57",
    clearSecretConfirm: "\u786E\u5B9A\u8981\u6E05\u9664\u5DF2\u8BBE\u7F6E\u7684\u957F\u671F\u5BC6\u7801\u5417\uFF1F\u6E05\u9664\u540E\u5C06\u65E0\u6CD5\u518D\u4F7F\u7528\u56FA\u5B9A\u5BC6\u7801\u767B\u5F55\u3002",
    // 卡片 4: 设备列表
    deviceCardTitle: "\u5DF2\u6388\u6743\u63A5\u5165\u8BBE\u5907\u5217\u8868",
    deviceCardDesc: "\u6240\u6709\u5DF2\u901A\u8FC7\u77ED\u671F\u914D\u5BF9\u7801\u3001\u957F\u671F\u5BC6\u7801\u6216\u514D\u5BC6\u76F4\u8FDE\u6210\u529F\u63A5\u5165\u7684\u79FB\u52A8\u8BBE\u5907\u3002\u60A8\u53EF\u4EE5\u968F\u65F6\u64A4\u9500\u5355\u4E2A\u8BBE\u5907\uFF0C\u6216\u4E00\u952E\u6CE8\u9500\u5168\u90E8\u8BBE\u5907\u3002",
    authDevicesCount: "\u53F0\u8BBE\u5907\u5DF2\u6388\u6743",
    revokeAllBtn: "\u{1F5D1}\uFE0F \u4E00\u952E\u6CE8\u9500\u6240\u6709\u8BBE\u5907",
    revokeAllConfirm: "\u786E\u5B9A\u8981\u64A4\u9500\u5E76\u8E22\u4E0B\u7EBF\u6240\u6709\u5DF2\u6388\u6743\u7684\u8BBE\u5907\u5417\uFF1F",
    noDevices: "\u6682\u65E0\u5DF2\u6388\u6743\u8BBE\u5907\uFF0C\u4F7F\u7528\u624B\u673A\u626B\u7801\u914D\u5BF9\u540E\u5C06\u5728\u6B64\u81EA\u52A8\u5217\u51FA\u3002",
    deviceOnlineNow: "\u5728\u7EBF",
    deviceOffline: "\u79BB\u7EBF",
    deviceBypassLabel: "\u514D\u5BC6\u76F4\u8FDE",
    devicePasscodeLabel: "\u914D\u5BF9\u7801\u6388\u6743",
    deviceSecretLabel: "\u957F\u671F\u5BC6\u7801",
    deviceFirstSeen: "\u9996\u6B21\u6388\u6743\uFF1A",
    deviceLastSeen: "\u6700\u8FD1\u6D3B\u8DC3\uFF1A",
    revokeDeviceBtn: "\u8E22\u4E0B\u7EBF",
    revokeDeviceConfirm: "\u786E\u5B9A\u8981\u64A4\u9500\u8FD9\u53F0\u8BBE\u5907\u7684\u8BBF\u95EE\u6743\u9650\u5417\uFF1F",
    // 卡片 5: 防暴力破解与审计
    securityCardTitle: "\u9632\u66B4\u529B\u7834\u89E3\u4E0E IP \u5B89\u5168\u5BA1\u8BA1",
    securityCardDesc: "\u5B9E\u65F6\u76D1\u63A7\u6240\u6709\u5916\u90E8\u8BBF\u95EE IP \u7684\u8BF7\u6C42\u9891\u7387\u4E0E\u8BA4\u8BC1\u5931\u8D25\u6B21\u6570\u3002\u8FDE\u7EED\u8F93\u9519 5 \u6B21\u5C06\u81EA\u52A8\u9501\u5B9A IP\uFF0C\u9632\u6B62\u5BC6\u7801\u88AB\u6076\u610F\u66B4\u529B\u679A\u4E3E\u3002",
    securityNormal: "\u2705 \u6240\u6709\u5916\u90E8\u8BBF\u95EE IP \u72B6\u6001\u6B63\u5E38\uFF0C\u672A\u68C0\u6D4B\u5230\u66B4\u529B\u7834\u89E3\u6216\u5F02\u5E38\u7206\u7834\u98CE\u9669\u3002",
    unlockIpBtn: "\u{1F513} \u89E3\u9664\u9501\u5B9A",
    unlockIpConfirm: "\u786E\u5B9A\u8981\u4E3A IP {ip} \u89E3\u9664\u5C01\u9501\u5417\uFF1F",
    clearSecurityLogBtn: "\u{1F5D1}\uFE0F \u6E05\u7A7A\u5BA1\u8BA1\u65E5\u5FD7",
    clearSecurityLogConfirm: "\u786E\u5B9A\u8981\u6E05\u7A7A\u6240\u6709 IP \u8BBF\u95EE\u4E0E\u5B89\u5168\u5BA1\u8BA1\u65E5\u5FD7\u5417\uFF1F",
    thIp: "\u8BBF\u95EE\u6765\u6E90 IP",
    thStatus: "\u5F53\u524D\u72B6\u6001",
    thFailed: "\u5931\u8D25/\u603B\u6B21\u6570",
    thLastSeen: "\u6700\u8FD1\u8BBF\u95EE",
    thAction: "\u64CD\u4F5C",
    statusLocked: "\u{1F6AB} \u5DF2\u88AB\u9501\u5B9A",
    statusNormal: "\u{1F7E2} \u6B63\u5E38",
    // 卡片 6: 本地存储说明
    storageCardTitle: "\u672C\u5730\u6570\u636E\u4E0E\u5BC6\u94A5\u6301\u4E45\u5316\u5B58\u50A8\u8BF4\u660E",
    storageCardDesc: "\u6240\u6709\u654F\u611F\u51ED\u8BC1\u5747\u5728\u672C\u5730\u7ECF\u8FC7\u52A0\u76D0\u54C8\u5E0C\u6216\u975E\u5BF9\u79F0\u52A0\u5BC6\u4FDD\u62A4\uFF0C\u4E0D\u4F9D\u8D56\u4EFB\u4F55\u7B2C\u4E09\u65B9\u4E91\u7AEF\u9274\u6743\u4E2D\u5FC3\u3002",
    storageDeviceFile: "\u5DF2\u6388\u6743\u8BBE\u5907\u4E0E\u4F1A\u8BDD\u7F13\u5B58\u6587\u4EF6\uFF1A",
    storageRsaFile: "\u670D\u52A1\u7AEF RSA \u79C1\u94A5\u6587\u4EF6 (0o600 \u6743\u9650\u4FDD\u62A4)\uFF1A",
    storageStylesFile: "\u79FB\u52A8\u7AEF\u6837\u5F0F\u7247\u6BB5\u6587\u4EF6 (\u53EF\u72EC\u7ACB\u542F\u505C\u7684 CSS \u5C0F\u63D2\u4EF6)\uFF1A",
    // 卡片 7: 全局高级配置
    configCardTitle: "\u5168\u5C40\u9AD8\u7EA7\u5B89\u5168\u53C2\u6570\u914D\u7F6E",
    configCardDesc: "\u8C03\u6574\u5355 IP \u8BBF\u95EE\u9891\u7387\u9650\u5236\u3001\u8F93\u9519\u5C01\u7981\u9608\u503C\u4E0E\u9501\u5B9A\u6301\u7EED\u65F6\u95F4\u3002\u70B9\u51FB\u4FDD\u5B58\u5C06\u7ACB\u5373\u751F\u6548\u5E76\u81EA\u52A8\u540C\u6B65\u5199\u56DE ~/.dsh/settings.yaml \u914D\u7F6E\u6587\u4EF6\u3002",
    copySettingsPathBtn: "\u{1F4CB} \u590D\u5236 settings.yaml \u8DEF\u5F84",
    fieldVisitsLimit: "\u23F1\uFE0F \u6BCF\u5206\u949F\u8BBF\u95EE\u4E0A\u9650 (\u6B21/\u5206)",
    fieldVisitsLimitHint: "\u5355 IP 1\u5206\u949F\u5185\u6253\u5F00\u767B\u5F55\u9875\u8D85\u8FC7\u6B64\u503C\u5C06\u89E6\u53D1\u9650\u9891",
    fieldFailedLimit: "\u{1F6E1}\uFE0F \u8F93\u9519\u5BC6\u7801\u5C01\u7981\u9608\u503C (\u6B21)",
    fieldFailedLimitHint: "\u8FDE\u7EED\u8F93\u9519\u914D\u5BF9\u7801/\u5BC6\u7801\u8FBE\u5230\u6B64\u503C\u5C06\u5C01\u9501\u8BE5 IP",
    fieldLockDuration: "\u{1F6AB} \u89E6\u53D1\u5C01\u9501\u6301\u7EED\u65F6\u95F4 (\u5206\u949F)",
    fieldLockDurationHint: "IP \u88AB\u9501\u5B9A\u540E\u7684\u51B7\u5374\u7B49\u5F85\u65F6\u957F (\u9ED8\u8BA4 15 \u5206\u949F)",
    restoreDefaultsBtn: "\u{1F504} \u6062\u590D\u9ED8\u8BA4\u53C2\u6570",
    saveConfigBtn: "\u{1F4BE} \u4FDD\u5B58\u53C2\u6570\u914D\u7F6E",
    savingConfigBtn: "\u6B63\u5728\u4FDD\u5B58...",
    saveConfigConfirm: "\u786E\u5B9A\u8981\u4FDD\u5B58\u5F53\u524D\u9AD8\u7EA7\u5B89\u5168\u53C2\u6570\u914D\u7F6E\u5417\uFF1F\u4FDD\u5B58\u540E\u5C06\u7ACB\u5373\u751F\u6548\u5E76\u81EA\u52A8\u540C\u6B65\u5199\u56DE ~/.dsh/settings.yaml\u3002",
    restoreDefaultsConfirm: "\u786E\u5B9A\u8981\u5C06\u5B89\u5168\u53C2\u6570\u6062\u590D\u4E3A\u7CFB\u7EDF\u9ED8\u8BA4\u503C\uFF0860\u6B21/\u5206\u30015\u6B21\u5931\u8D25\u3001\u9501\u5B9A15\u5206\u949F\uFF09\u5417\uFF1F\u786E\u8BA4\u540E\u5C06\u76F4\u63A5\u751F\u6548\u5E76\u81EA\u52A8\u540C\u6B65\u3002",
    saveConfigSuccessToast: "\u9AD8\u7EA7\u5B89\u5168\u53C2\u6570\u5DF2\u6210\u529F\u4FDD\u5B58\u5E76\u540C\u6B65\u5230 settings.yaml\uFF01",
    restoreDefaultsSuccessToast: "\u5DF2\u6210\u529F\u6062\u590D\u9ED8\u8BA4\u5B89\u5168\u53C2\u6570\u5E76\u7ACB\u5373\u751F\u6548\uFF01",
    saveConfigFailTip: "\u53C2\u6570\u5FC5\u987B\u4E3A\u5927\u4E8E 0 \u7684\u6709\u6548\u6574\u6570",
    // 卡片 8: 移动端样式片段（样式小插件）
    tabAccess: "\u63A5\u5165",
    tabDevices: "\u8BBE\u5907\u4E0E\u5B89\u5168",
    tabStyle: "\u6837\u5F0F\u8986\u5199",
    tabStorage: "\u672C\u5730\u6570\u636E",
    stylesCardTitle: "\u79FB\u52A8\u7AEF\u6837\u5F0F\u7247\u6BB5\uFF08\u6837\u5F0F\u5C0F\u63D2\u4EF6\uFF09",
    stylesCardDesc: "\u4EE5\u53EF\u72EC\u7ACB\u542F\u505C\u7684 CSS \u7247\u6BB5\u65B9\u5F0F\u9002\u914D DSH Web \u754C\u9762\u3002\u5185\u7F6E\u9884\u8BBE\u6309\u754C\u9762\u533A\u57DF\u5206\u4E3A\u4FA7\u8FB9\u680F\u3001\u8BBE\u7F6E\u9762\u677F\u4E0E\u6B63\u6587\u4E09\u6BB5\uFF0C\u6BCF\u6BB5\u5747\u53EF\u5206\u522B\u8BBE\u7F6E PC / \u79FB\u52A8\u7AEF\u662F\u5426\u542F\u7528\uFF1B\u4F60\u4E5F\u53EF\u4EE5\u7C98\u8D34\u81EA\u5DF1\u7684 CSS \u5C0F\u63D2\u4EF6\uFF0C\u4FDD\u5B58\u540E\u4E0B\u4E00\u6B21\u9875\u9762\u52A0\u8F7D\u7ACB\u5373\u751F\u6548\uFF0C\u65E0\u9700\u91CD\u542F\u3002",
    stylesPresetsTitle: "\u{1F9E9} \u5185\u7F6E\u9884\u8BBE\u7247\u6BB5",
    stylesCustomTitle: "\u270D\uFE0F \u81EA\u5B9A\u4E49\u7247\u6BB5",
    stylesPcShort: "PC",
    stylesMobileShort: "\u79FB\u52A8\u7AEF",
    stylesBothDevices: "PC + \u79FB\u52A8\u7AEF",
    stylesMobileOnlyBadge: "\u4EC5\u79FB\u52A8\u7AEF",
    stylesPcOnlyBadge: "\u4EC5 PC",
    stylesDisabled: "\u5DF2\u505C\u7528",
    stylesViewCss: "\u67E5\u770B CSS",
    stylesHideCss: "\u6536\u8D77 CSS",
    stylesCopyCss: "\u{1F4CB} \u590D\u5236\u6837\u5F0F",
    stylesCopyCssDone: "\u6837\u5F0F\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01",
    stylesNamePlaceholder: "\u7247\u6BB5\u540D\u79F0\uFF08\u5FC5\u586B\uFF09",
    stylesCssPlaceholder: "\u7C98\u8D34\u6216\u7F16\u5199 CSS \u4EE3\u7801\u7247\u6BB5\u2026\uFF08\u79FB\u52A8\u7AEF\u53EF\u7528 html[data-dsh-mobile] \u4F5C\u4E3A\u4F5C\u7528\u57DF\u9009\u62E9\u5668\uFF09",
    stylesAddNew: "\uFF0B \u65B0\u589E\u81EA\u5B9A\u4E49\u7247\u6BB5",
    stylesSave: "\u{1F4BE} \u4FDD\u5B58\u7247\u6BB5",
    stylesCancelEdit: "\u53D6\u6D88",
    stylesEditBtn: "\u7F16\u8F91",
    stylesDeleteBtn: "\u5220\u9664",
    stylesResetAll: "\u{1F504} \u6062\u590D\u9ED8\u8BA4\u542F\u505C",
    stylesEmptyCustom: "\u6682\u65E0\u81EA\u5B9A\u4E49\u7247\u6BB5\uFF0C\u70B9\u51FB\u300C\u65B0\u589E\u81EA\u5B9A\u4E49\u7247\u6BB5\u300D\u5F00\u59CB\u3002",
    stylesLoadFail: "\u52A0\u8F7D\u6837\u5F0F\u7247\u6BB5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
    stylesSaveSuccess: "\u6837\u5F0F\u7247\u6BB5\u5DF2\u4FDD\u5B58\uFF0C\u5237\u65B0\u9875\u9762\u5373\u53EF\u770B\u5230\u6548\u679C",
    stylesDeleteConfirm: "\u786E\u5B9A\u8981\u5220\u9664\u8BE5\u81EA\u5B9A\u4E49\u6837\u5F0F\u7247\u6BB5\u5417\uFF1F",
    stylesResetConfirm: "\u786E\u5B9A\u8981\u6062\u590D\u6240\u6709\u7247\u6BB5\u7684\u9ED8\u8BA4\u542F\u505C\u72B6\u6001\u5417\uFF1F\uFF08\u5185\u7F6E\u9884\u8BBE\uFF1APC \u5173\u95ED\u3001\u79FB\u52A8\u7AEF\u542F\u7528\uFF1B\u81EA\u5B9A\u4E49\u7247\u6BB5\uFF1APC \u5173\u95ED\u3001\u79FB\u52A8\u7AEF\u542F\u7528\uFF09",
    stylesFieldsRequired: "\u8BF7\u586B\u5199\u7247\u6BB5\u540D\u79F0\u4E0E CSS \u5185\u5BB9",
    stylesHint: "\u{1F4A1} \u63D0\u793A\uFF1A\u6BCF\u6BB5\u9884\u8BBE\u4E0E\u81EA\u5B9A\u4E49\u7247\u6BB5\u90FD\u652F\u6301 PC / \u79FB\u52A8\u7AEF\u5206\u522B\u542F\u7528\u3002\u79FB\u52A8\u7AEF\u8BF7\u6C42\u4F1A\u7ED9 <html> \u6253\u4E0A data-dsh-mobile \u6807\u8BB0\uFF1B\u5185\u7F6E\u9884\u8BBE\u9762\u5411\u79FB\u52A8\u7AEF\u4F18\u5316\uFF08\u9ED8\u8BA4 PC \u5173\u95ED\uFF09\uFF0C\u5728 PC \u4E0A\u542F\u7528\u65F6\u8BF7\u786E\u4FDD\u7247\u6BB5\u4E0D\u4F9D\u8D56 data-dsh-mobile \u4F5C\u7528\u57DF\u3002",
    // 插件共存警示横幅
    conflictBannerTitle: "\u68C0\u6D4B\u5230\u5176\u4ED6\u8FDC\u7A0B\u63A5\u5165\u63D2\u4EF6",
    conflictUnknownPlugin: "\u53E6\u4E00\u6B3E\u8FDC\u7A0B\u63A5\u5165\u7C7B\u63D2\u4EF6",
    conflictBannerBody: "\u68C0\u6D4B\u5230 {plugin} \u5DF2\u5360\u7528\u914D\u5BF9\u5171\u4EAB\u670D\u52A1\uFF08remoteWebUiPairing\uFF09\uFF0C\u672C\u63D2\u4EF6\u5DF2\u81EA\u52A8\u8BA9\u51FA\u4EE5\u4FDD\u8BC1\u6B63\u5E38\u542F\u52A8\u3002\u4E24\u5957\u8FDC\u7A0B\u63A5\u5165\u529F\u80FD\u5E76\u5B58\u53EF\u80FD\u51FA\u73B0\u91CD\u590D\u5165\u53E3\u4E0E\u72B6\u6001\u4E0D\u4E00\u81F4\uFF0C\u5EFA\u8BAE\u53EA\u4FDD\u7559\u5176\u4E00\u3002\u53EF\u590D\u5236\u4E0B\u65B9\u8BCA\u65AD\u4FE1\u606F\uFF0C\u7C98\u8D34\u7ED9 AI \u52A9\u624B\u6309\u6B65\u9AA4\u5904\u7406\u3002",
    conflictCopyBtn: "\u{1F4CB} \u590D\u5236\u8BCA\u65AD\u4E0E\u4FEE\u590D\u4FE1\u606F",
    conflictCopiedTip: "\u8BCA\u65AD\u4FE1\u606F\u5DF2\u590D\u5236\uFF0C\u53EF\u76F4\u63A5\u7C98\u8D34\u7ED9 AI \u52A9\u624B\u534F\u52A9\u5904\u7406",
    conflictReportText: "[DSH \u63D2\u4EF6\u51B2\u7A81\u8BCA\u65AD\u62A5\u544A]\n\u73B0\u8C61\uFF1Adsh-remote-mobile \u8BBE\u7F6E\u9762\u677F\u63D0\u793A\u300C\u68C0\u6D4B\u5230\u5176\u4ED6\u8FDC\u7A0B\u63A5\u5165\u63D2\u4EF6\u300D\u3002\n\u539F\u56E0\uFF1A\u53E6\u4E00\u6B3E\u8FDC\u7A0B/Web \u63A5\u5165\u7C7B\u63D2\u4EF6\u5360\u7528\u4E86 Cordis \u5171\u4EAB\u670D\u52A1 remoteWebUiPairing\uFF0Cdsh-remote-mobile \u4E3A\u4FDD\u8BC1\u6B63\u5E38\u542F\u52A8\u5DF2\u81EA\u52A8\u8BA9\u51FA\u8BE5\u670D\u52A1\uFF0C\u5F53\u524D\u4E24\u5957\u8FDC\u7A0B\u63A5\u5165\u529F\u80FD\u5E76\u5B58\u3002\n\u5360\u7528\u65B9\u63D2\u4EF6\u5305\u540D\uFF1A{plugin}\n\u5360\u7528\u65B9 loader entry id\uFF1A{entryId}\n\u5904\u7406\u65B9\u6848\uFF08\u4E8C\u9009\u4E00\uFF09\uFF1A\n\u65B9\u6848 A\uFF08\u4FDD\u7559 dsh-remote-mobile\uFF0C\u7981\u7528\u5360\u7528\u65B9\uFF09\uFF1A\n1. \u6253\u5F00\u914D\u7F6E\u6587\u4EF6 ~/.dsh/profiles/web/cordis.patch.yml\n2. \u5728\u6587\u4EF6\u672B\u5C3E\u8FFD\u52A0\u4EE5\u4E0B\u4E24\u884C\uFF08\u6CE8\u610F YAML \u7F29\u8FDB\uFF0C\u7B2C\u4E8C\u884C\u524D\u6709\u4E24\u4E2A\u7A7A\u683C\uFF09\uFF1A\n- id: {entryId}\n  disabled: true\n3. \u7ED3\u675F\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684 dsh web \u8FDB\u7A0B\uFF0C\u91CD\u65B0\u6267\u884C dsh web --no-open\n\u65B9\u6848 B\uFF08\u4FDD\u7559\u5360\u7528\u65B9\uFF0C\u5378\u8F7D dsh-remote-mobile\uFF09\uFF1A\n\u6267\u884C\u547D\u4EE4 dsh plugin --profile web remove dsh-remote-mobile \u540E\u91CD\u542F dsh web",
    conflictReportNoEntryIdText: "[DSH \u63D2\u4EF6\u51B2\u7A81\u8BCA\u65AD\u62A5\u544A]\n\u73B0\u8C61\uFF1Adsh-remote-mobile \u8BBE\u7F6E\u9762\u677F\u63D0\u793A\u300C\u68C0\u6D4B\u5230\u5176\u4ED6\u8FDC\u7A0B\u63A5\u5165\u63D2\u4EF6\u300D\u3002\n\u539F\u56E0\uFF1A\u53E6\u4E00\u6B3E\u8FDC\u7A0B/Web \u63A5\u5165\u7C7B\u63D2\u4EF6\u5360\u7528\u4E86 Cordis \u5171\u4EAB\u670D\u52A1 remoteWebUiPairing\uFF0Cdsh-remote-mobile \u4E3A\u4FDD\u8BC1\u6B63\u5E38\u542F\u52A8\u5DF2\u81EA\u52A8\u8BA9\u51FA\u8BE5\u670D\u52A1\uFF0C\u5F53\u524D\u4E24\u5957\u8FDC\u7A0B\u63A5\u5165\u529F\u80FD\u5E76\u5B58\u3002\n\u5360\u7528\u65B9\u63D2\u4EF6\u5305\u540D\uFF1A{plugin}\n\u5360\u7528\u65B9 loader entry id\uFF1A\u672A\u80FD\u81EA\u52A8\u8BC6\u522B\n\u5904\u7406\u65B9\u6848\uFF08\u4E8C\u9009\u4E00\uFF09\uFF1A\n\u65B9\u6848 A\uFF08\u4FDD\u7559 dsh-remote-mobile\uFF0C\u7981\u7528\u5360\u7528\u65B9\uFF09\uFF1A\n1. \u6267\u884C dsh --dump-config \u67E5\u770B\u5168\u90E8 loader entry\uFF0C\u627E\u5230\u5360\u7528\u65B9\u63D2\u4EF6\u5BF9\u5E94\u7684\u6761\u76EE id\n2. \u6253\u5F00\u914D\u7F6E\u6587\u4EF6 ~/.dsh/profiles/web/cordis.patch.yml\uFF0C\u5728\u6587\u4EF6\u672B\u5C3E\u8FFD\u52A0\uFF08\u6CE8\u610F YAML \u7F29\u8FDB\uFF09\uFF1A\n- id: <\u5360\u7528\u65B9\u6761\u76EEid>\n  disabled: true\n3. \u7ED3\u675F\u5F53\u524D\u6B63\u5728\u8FD0\u884C\u7684 dsh web \u8FDB\u7A0B\uFF0C\u91CD\u65B0\u6267\u884C dsh web --no-open\n\u65B9\u6848 B\uFF08\u4FDD\u7559\u5360\u7528\u65B9\uFF0C\u5378\u8F7D dsh-remote-mobile\uFF09\uFF1A\n\u6267\u884C\u547D\u4EE4 dsh plugin --profile web remove dsh-remote-mobile \u540E\u91CD\u542F dsh web",
    conflictBannerDismiss: "\u77E5\u9053\u4E86",
    // Toast 提示
    toastDeviceConnected: "\u{1F389} \u65B0\u8BBE\u5907\u63A5\u5165\u6210\u529F\uFF1A{name} ({ip})",
    toastDeviceOnline: "\u{1F4F6} \u8BBE\u5907\u91CD\u65B0\u4E0A\u7EBF\uFF1A{name} ({ip})",
    toastIpLocked: "\u{1F6AB} \u89E6\u53D1\u5B89\u5168\u8B66\u62A5\uFF1AIP {ip} \u8FDE\u7EED\u8BA4\u8BC1\u5931\u8D25\u5DF2\u88AB\u9501\u5B9A\uFF01"
  },
  en: {
    // Main
    title: "Remote & Mobile Access",
    subtitle: "Enable access via Tailscale private network and local Wi-Fi, featuring QR code pairing and persistent passwords.",
    // Card 1: Network & Bypass
    netCardTitle: "Network Access & Bypass Management",
    netCardDesc: "Enter the address below in your mobile browser, or scan the QR code to pair. You can enable direct bypass if you are in a trusted private network.",
    tailscaleSectionTitle: "Tailscale Private Network (Recommended)",
    tailscaleBadge: "Tailscale IP",
    tailscaleNotConnected: "No Tailscale private IP detected",
    tailscaleGuide: "Please ensure Tailscale is installed and logged in on this machine for secure access without port forwarding.",
    lanSectionTitle: "Local Area Network (LAN / Wi-Fi)",
    lanBadge: "LAN IP",
    lanNotConnected: "No available local LAN IP detected",
    copyUrlBtn: "\u{1F4CB} Copy Link",
    copiedTip: "Link copied to clipboard!",
    directBypassToggle: "Direct Bypass Mode (Passwordless)",
    directBypassOn: "Bypass Enabled",
    directBypassOff: "Bypass Disabled",
    tailscaleBypassDesc: "When enabled, any device connecting via Tailscale can directly access the console without passwords or pairing codes.",
    lanBypassWarningTitle: "\u{1F6A8} HIGH RISK SECURITY WARNING: LAN BYPASS",
    lanBypassDesc: "Enabling LAN Bypass allows ANY device connected to the same Wi-Fi router (including guest/shared users) to execute commands and control DSH without any authentication. ONLY enable this in completely trusted home private networks!",
    lanBypassConfirm: "[\u{1F6A8} CRITICAL SECURITY RISK CONFIRMATION]\n\nAre you sure you want to enable LAN Passwordless Bypass?\n\n\u26A0\uFE0F Consequences:\nANY device on the same Wi-Fi network (smartphones, PCs, guests) will gain FULL access and control over your DSH workspace without passwords or codes!\n\nDo NOT enable this on public networks (Cafes, Hotels, Office Wi-Fi)!",
    // Card 2: Pairing & QR
    pairingCardTitle: "Quick Pairing & QR Code Access",
    pairingCardDesc: "When both devices are on the same network, scan the QR code or enter the 6-digit dynamic pairing code to authenticate.",
    shortCodeTitle: "6-Digit Dynamic Pairing Code",
    codeValidUntil: "Expires in: ",
    codeExpired: "Pairing code expired. Click refresh to generate a new one.",
    clickToReveal: "Click to reveal 6-digit code",
    clickToHide: "Click to hide",
    refreshCodeBtn: "\u{1F504} Refresh Code",
    qrTitle: "Scan QR Code for Instant Access",
    toggleQrShow: "Show QR Code",
    toggleQrHide: "Hide QR Code",
    switchTailscaleTab: "Tailscale QR",
    switchLanTab: "LAN (Wi-Fi) QR",
    copyDirectAuthLink: "\u{1F4CB} Copy Link with Code",
    // Card 3: Persistent Password
    secretCardTitle: "Configure Persistent Password (Optional)",
    secretCardDesc: "If you prefer not using 6-digit short codes every time, set a fixed password here. Entering this password on mobile grants persistent access.",
    secretConfigured: "\u2705 Persistent password is configured (securely salted & encrypted)",
    secretNotConfigured: "\u26AA No persistent password set (authentication via temporary codes only)",
    secretInputPlaceholder: "Enter a password with at least 6 alphanumeric characters",
    secretInputLabel: "Password:",
    showPassword: "\u{1F441}\uFE0F Show Password",
    hidePassword: "\u{1F648} Hide Password",
    saveSecretBtn: "\u{1F4BE} Save Password",
    clearSecretBtn: "\u{1F5D1}\uFE0F Clear Password",
    secretWeakTip: "Password must be at least 6 characters and contain both letters and numbers",
    clearSecretConfirm: "Are you sure you want to clear the persistent password? You will no longer be able to log in with a fixed password.",
    // Card 4: Device List
    deviceCardTitle: "Authorized Devices List",
    deviceCardDesc: "All mobile devices successfully authorized via pairing code, persistent password, or bypass. You can revoke access at any time.",
    authDevicesCount: "device(s) authorized",
    revokeAllBtn: "\u{1F5D1}\uFE0F Revoke All Devices",
    revokeAllConfirm: "Are you sure you want to disconnect and revoke all authorized devices?",
    noDevices: "No authorized devices yet. Scan the QR code with your mobile device to connect.",
    deviceOnlineNow: "Online",
    deviceOffline: "Offline",
    deviceBypassLabel: "Bypass",
    devicePasscodeLabel: "Code",
    deviceSecretLabel: "Password",
    deviceFirstSeen: "Authorized: ",
    deviceLastSeen: "Last active: ",
    revokeDeviceBtn: "Revoke",
    revokeDeviceConfirm: "Are you sure you want to revoke access for this device?",
    // Card 5: Security & Audit
    securityCardTitle: "Brute-Force Defense & IP Audit",
    securityCardDesc: "Real-time monitoring of external access IP request frequencies and failure rates. Automatically locks IPs after 5 consecutive failures.",
    securityNormal: "\u2705 All external IPs are in good standing. No brute-force attacks detected.",
    unlockIpBtn: "\u{1F513} Unlock IP",
    unlockIpConfirm: "Are you sure you want to unlock IP {ip}?",
    clearSecurityLogBtn: "\u{1F5D1}\uFE0F Clear Audit Logs",
    clearSecurityLogConfirm: "Are you sure you want to clear all IP access and security audit logs?",
    thIp: "Client IP",
    thStatus: "Status",
    thFailed: "Fail / Total",
    thLastSeen: "Last Seen",
    thAction: "Actions",
    statusLocked: "\u{1F6AB} Locked",
    statusNormal: "\u{1F7E2} Normal",
    // Card 6: Storage
    storageCardTitle: "Local Storage & Key Persistence",
    storageCardDesc: "All sensitive credentials are protected locally via slow salt hashing and asymmetric RSA cryptography, without cloud dependencies.",
    storageDeviceFile: "Authorized devices & session cache:",
    storageRsaFile: "Server RSA private key (0o600 protected):",
    storageStylesFile: "Mobile style snippets file (toggleable CSS mini-plugins):",
    // Card 7: Advanced Security Config
    configCardTitle: "Global Security Policy Configuration",
    configCardDesc: "Configure per-IP rate limits, brute-force failure thresholds, and lockout durations. Changes take effect immediately and sync to ~/.dsh/settings.yaml.",
    copySettingsPathBtn: "\u{1F4CB} Copy settings.yaml Path",
    fieldVisitsLimit: "\u23F1\uFE0F Max Visits per Minute (visits/min)",
    fieldVisitsLimitHint: "Rate limit triggered when a single IP opens login page more than this value",
    fieldFailedLimit: "\u{1F6E1}\uFE0F Max Failed Password Attempts (times)",
    fieldFailedLimitHint: "IP locked after consecutive incorrect pairing codes or passwords",
    fieldLockDuration: "\u{1F6AB} Lockout Duration (minutes)",
    fieldLockDurationHint: "Cool-down lock period for blocked IPs (default: 15 minutes)",
    restoreDefaultsBtn: "\u{1F504} Restore Defaults",
    saveConfigBtn: "\u{1F4BE} Save Configuration",
    savingConfigBtn: "Saving...",
    saveConfigConfirm: "Are you sure you want to save the current security policy? It will take effect immediately and sync to ~/.dsh/settings.yaml.",
    restoreDefaultsConfirm: "Are you sure you want to restore security policies to default values (60 visits/min, 5 failed attempts, 15m lockout)? It will take effect immediately.",
    saveConfigSuccessToast: "Security policy successfully saved and synced to settings.yaml!",
    restoreDefaultsSuccessToast: "Default security policies restored and applied immediately!",
    saveConfigFailTip: "Parameters must be valid integers greater than 0",
    // Card 8: Mobile Style Snippets (style mini-plugin)
    tabAccess: "Access",
    tabDevices: "Devices & Security",
    tabStyle: "Style Overrides",
    tabStorage: "Local Data",
    stylesCardTitle: "Mobile Style Snippets",
    stylesCardDesc: "Adapt the DSH web UI via toggleable CSS snippets. Built-in presets are split by UI area: sidebar, settings panel and conversation. Each can be enabled per device (PC / Mobile). You can also add your own CSS mini-plugins; changes take effect on the next page load without restart.",
    stylesPresetsTitle: "\u{1F9E9} Built-in Presets",
    stylesCustomTitle: "\u270D\uFE0F Custom Snippets",
    stylesPcShort: "PC",
    stylesMobileShort: "Mobile",
    stylesBothDevices: "PC + Mobile",
    stylesMobileOnlyBadge: "Mobile only",
    stylesPcOnlyBadge: "PC only",
    stylesDisabled: "Disabled",
    stylesViewCss: "View CSS",
    stylesHideCss: "Hide CSS",
    stylesCopyCss: "\u{1F4CB} Copy CSS",
    stylesCopyCssDone: "CSS copied to clipboard!",
    stylesNamePlaceholder: "Snippet name (required)",
    stylesCssPlaceholder: "Paste or write CSS here\u2026 (html[data-dsh-mobile] can be used as a mobile scope selector)",
    stylesAddNew: "\uFF0B Add Custom Snippet",
    stylesSave: "\u{1F4BE} Save Snippet",
    stylesCancelEdit: "Cancel",
    stylesEditBtn: "Edit",
    stylesDeleteBtn: "Delete",
    stylesResetAll: "\u{1F504} Reset Defaults",
    stylesEmptyCustom: 'No custom snippets yet. Click "Add Custom Snippet" to start.',
    stylesLoadFail: "Failed to load style snippets, please try again later",
    stylesSaveSuccess: "Style snippet saved. Refresh to see the effect.",
    stylesDeleteConfirm: "Are you sure you want to delete this custom style snippet?",
    stylesResetConfirm: "Reset all snippets to default states? (Built-ins: PC off / Mobile on. Custom: PC off / Mobile on.)",
    stylesFieldsRequired: "Please fill in both the snippet name and CSS content",
    stylesHint: "\u{1F4A1} Tip: every preset and custom snippet has separate PC / Mobile toggles. Mobile requests add a data-dsh-mobile attribute to <html>. Built-ins target mobile (PC off by default); when enabling them on PC, make sure they do not depend on the data-dsh-mobile scope.",
    // Plugin coexistence banner
    conflictBannerTitle: "Another remote-access plugin detected",
    conflictUnknownPlugin: "another remote-access plugin",
    conflictBannerBody: "{plugin} has already registered the shared pairing service (remoteWebUiPairing); this plugin has automatically yielded it to keep startup safe. Running two remote-access features side by side may cause duplicated entries and inconsistent state \u2014 keeping only one is recommended. Copy the diagnosis below and paste it to an AI assistant for step-by-step help.",
    conflictCopyBtn: "\u{1F4CB} Copy diagnosis & fix",
    conflictCopiedTip: "Diagnosis copied! Paste it to your AI assistant",
    conflictReportText: '[DSH plugin conflict diagnosis]\nSymptom: the dsh-remote-mobile settings panel shows "Another remote-access plugin detected".\nCause: another remote/Web access plugin registered the shared Cordis service remoteWebUiPairing first; dsh-remote-mobile yielded it to keep startup safe, so both remote features now run in parallel.\nConflicting plugin package: {plugin}\nConflicting loader entry id: {entryId}\nFix (choose ONE):\nOption A (keep dsh-remote-mobile, disable the other):\n1. Open ~/.dsh/profiles/web/cordis.patch.yml\n2. Append these two lines at the end (mind YAML indentation, two spaces before disabled):\n- id: {entryId}\n  disabled: true\n3. Stop the running dsh web process, then run dsh web --no-open again\nOption B (keep the other, remove dsh-remote-mobile):\nRun dsh plugin --profile web remove dsh-remote-mobile and restart dsh web',
    conflictReportNoEntryIdText: '[DSH plugin conflict diagnosis]\nSymptom: the dsh-remote-mobile settings panel shows "Another remote-access plugin detected".\nCause: another remote/Web access plugin registered the shared Cordis service remoteWebUiPairing first; dsh-remote-mobile yielded it to keep startup safe, so both remote features now run in parallel.\nConflicting plugin package: {plugin}\nConflicting loader entry id: could not be detected automatically\nFix (choose ONE):\nOption A (keep dsh-remote-mobile, disable the other):\n1. Run dsh --dump-config to list all loader entries and find the entry id of the conflicting plugin\n2. Open ~/.dsh/profiles/web/cordis.patch.yml and append at the end (mind YAML indentation):\n- id: <the conflicting entry id>\n  disabled: true\n3. Stop the running dsh web process, then run dsh web --no-open again\nOption B (keep the other, remove dsh-remote-mobile):\nRun dsh plugin --profile web remove dsh-remote-mobile and restart dsh web',
    conflictBannerDismiss: "Got it",
    // Toast
    toastDeviceConnected: "\u{1F389} New device connected: {name} ({ip})",
    toastDeviceOnline: "\u{1F4F6} Device reconnected: {name} ({ip})",
    toastIpLocked: "\u{1F6AB} Security Alert: IP {ip} locked due to consecutive failures!"
  }
};
function resolveLocale(ctx, status) {
  if (typeof document !== "undefined" && document.documentElement && document.documentElement.lang) {
    return document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
  }
  if (status && typeof status.locale === "string") {
    return status.locale.toLowerCase().startsWith("en") ? "en" : "zh";
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language.toLowerCase().startsWith("en") ? "en" : "zh";
  }
  return "zh";
}
function t(key, lang, params) {
  var currentLang = lang && (lang.startsWith("en") || lang === "en") ? "en" : "zh";
  var dict = translations[currentLang] || translations.zh;
  var text = dict[key] || translations.zh[key] || key;
  if (params && typeof params === "object") {
    for (var p in params) {
      if (Object.prototype.hasOwnProperty.call(params, p)) {
        text = text.replace(new RegExp("\\{" + p + "\\}", "g"), String(params[p]));
      }
    }
  }
  return text;
}
function formatDeviceName(name, lang) {
  if (!name) return lang === "en" ? "Mobile Device" : "\u79FB\u52A8\u7AEF\u8BBE\u5907";
  if (lang !== "en") return name;
  return name.replace(/手机/g, "Phone").replace(/移动设备/g, "Mobile Device").replace(/微信内置浏览器/g, "WeChat Browser").replace(/局域网免密临时设备/g, "LAN Bypass Device").replace(/Tailscale免密临时设备/g, "Tailscale Bypass Device");
}
function formatAuthType(authType, lang) {
  if (!authType) return lang === "en" ? "\u26AA Pending" : "\u26AA \u5F85\u8BA4\u8BC1";
  if (lang !== "en") return authType;
  if (authType.includes("\u626B\u7801\u914D\u5BF9") || authType.includes("\u914D\u5BF9\u7801")) {
    if (authType.includes("365")) return "\u{1F4F1} QR Pairing (365d)";
    return "\u{1F4F1} QR Authenticated";
  }
  if (authType.includes("\u957F\u671F\u5BC6\u7801") || authType.includes("\u5BC6\u7801\u9A8C\u8BC1")) {
    if (authType.includes("365")) return "\u{1F511} Password Auth (365d)";
    return "\u{1F511} Password Auth";
  }
  if (authType.includes("\u5C40\u57DF\u7F51") || authType.includes("LAN")) {
    return "\u26A1 LAN Direct Bypass";
  }
  if (authType.includes("Tailscale")) {
    return "\u26A1 Tailscale Bypass";
  }
  if (authType.includes("\u5F85\u8BA4\u8BC1") || authType.includes("\u672A\u8BA4\u8BC1")) {
    return "\u26AA Pending";
  }
  return authType;
}
function formatFailedAttempts(count, lang) {
  if (lang === "en") {
    return count === 1 ? "\u26A0\uFE0F 1 failed attempt" : `\u26A0\uFE0F ${count} failed attempts`;
  }
  return `\u26A0\uFE0F \u66FE\u5931\u8D25 ${count} \u6B21`;
}

// src/client/components/NetworkCard.jsx
var import_jsx_runtime = require("react/jsx-runtime");
function NetworkCard({ status, toggleTailscale, toggleLan, copyText, lang }) {
  const tsHost = status.tailscaleIp || "100.x.y.z";
  const lanHost = status.lanIp || "127.0.0.1";
  const port = typeof window !== "undefined" && window.location.port || "3080";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            style: {
              fontSize: "15px",
              fontWeight: "600",
              color: "var(--dsw-alias-label-primary, inherit)",
              marginBottom: "4px"
            },
            children: t("netCardTitle", lang)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              marginBottom: "16px"
            },
            children: t("netCardDesc", lang)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            style: {
              paddingBottom: "16px",
              borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
              marginBottom: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px 12px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "16px", flexShrink: 0 }, children: "\u{1F512}" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "14px", fontWeight: "700", color: "var(--dsw-alias-label-primary, inherit)" }, children: t("tailscaleSectionTitle", lang) }),
                      status.tailscaleIp ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                        "span",
                        {
                          style: {
                            fontSize: "11px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(16,185,129,0.15)",
                            color: "#10b981",
                            fontWeight: "600",
                            whiteSpace: "nowrap",
                            flexShrink: 0
                          },
                          children: lang === "en" ? "Connected" : "\u5DF2\u8FDE\u63A5"
                        }
                      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                        "span",
                        {
                          style: {
                            fontSize: "11px",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: "rgba(239,68,68,0.15)",
                            color: "#ef4444",
                            fontWeight: "600",
                            whiteSpace: "nowrap",
                            flexShrink: 0
                          },
                          children: lang === "en" ? "Not Connected" : "\u672A\u8FDE\u63A5"
                        }
                      )
                    ] }),
                    status.tailscaleIp ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "auto" }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                        "span",
                        {
                          style: {
                            fontSize: "12px",
                            color: status.allowTailscale ? "var(--dsw-alias-brand-primary, #3b82f6)" : "var(--dsw-alias-label-secondary, #888)",
                            fontWeight: "600",
                            whiteSpace: "nowrap"
                          },
                          children: status.allowTailscale ? t("directBypassOn", lang) : t("directBypassOff", lang)
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                        "label",
                        {
                          style: {
                            position: "relative",
                            display: "inline-block",
                            width: "44px",
                            height: "24px",
                            cursor: "pointer",
                            userSelect: "none",
                            flexShrink: 0
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "input",
                              {
                                type: "checkbox",
                                checked: !!status.allowTailscale,
                                onChange: toggleTailscale,
                                style: { opacity: 0, width: 0, height: 0, margin: 0 }
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "span",
                              {
                                style: {
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  backgroundColor: status.allowTailscale ? "var(--dsw-alias-brand-primary, #3b82f6)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                                  transition: "background-color 0.25s ease",
                                  borderRadius: "24px"
                                }
                              }
                            ),
                            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                              "span",
                              {
                                style: {
                                  position: "absolute",
                                  top: "3px",
                                  left: "3px",
                                  width: "18px",
                                  height: "18px",
                                  backgroundColor: "#ffffff",
                                  borderRadius: "50%",
                                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.25)",
                                  transform: status.allowTailscale ? "translateX(20px)" : "translateX(0px)",
                                  transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                                }
                              }
                            )
                          ]
                        }
                      )
                    ] }) : null
                  ]
                }
              ),
              status.tailscaleIp ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "div",
                {
                  style: {
                    fontSize: "13px",
                    fontFamily: "monospace",
                    color: "var(--dsw-alias-brand-primary, #3b82f6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "6px 10px",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.15))",
                    borderRadius: "8px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "span",
                      {
                        style: {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          minWidth: 0
                        },
                        children: `http://${tsHost}:${port}`
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                      "button",
                      {
                        type: "button",
                        onClick: () => copyText(`http://${tsHost}:${port}`, t("copiedTip", lang)),
                        style: {
                          padding: "3px 10px",
                          background: "var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08))",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          borderRadius: "4px",
                          fontSize: "11px",
                          cursor: "pointer",
                          color: "var(--dsw-alias-label-secondary, inherit)",
                          whiteSpace: "nowrap",
                          flexShrink: 0
                        },
                        children: t("copyUrlBtn", lang)
                      }
                    )
                  ]
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "var(--dsw-alias-label-tertiary, #888)",
                    lineHeight: "1.4"
                  },
                  children: t("tailscaleGuide", lang)
                }
              ),
              status.tailscaleIp ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    color: "var(--dsw-alias-label-tertiary, #888)",
                    lineHeight: "1.4"
                  },
                  children: t("tailscaleBypassDesc", lang)
                }
              ) : null
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "8px 12px"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "16px", flexShrink: 0 }, children: "\u{1F3E0}" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { fontSize: "14px", fontWeight: "700", color: "var(--dsw-alias-label-primary, inherit)" }, children: t("lanSectionTitle", lang) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "span",
                    {
                      style: {
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(16,185,129,0.15)",
                        color: "#10b981",
                        fontWeight: "600",
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      },
                      children: lang === "en" ? "Ready" : "\u5DF2\u5C31\u7EEA"
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "auto" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "span",
                    {
                      style: {
                        fontSize: "12px",
                        color: status.allowLan ? "#ef4444" : "var(--dsw-alias-label-secondary, #888)",
                        fontWeight: status.allowLan ? "700" : "500",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        whiteSpace: "nowrap"
                      },
                      children: status.allowLan ? lang === "en" ? "\u{1F6A8} LAN Bypass (High Risk)" : "\u{1F6A8} \u5C40\u57DF\u7F51\u514D\u5BC6\uFF08\u9AD8\u5371\uFF09" : t("directBypassOff", lang)
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                    "label",
                    {
                      style: {
                        position: "relative",
                        display: "inline-block",
                        width: "44px",
                        height: "24px",
                        cursor: "pointer",
                        userSelect: "none",
                        flexShrink: 0
                      },
                      children: [
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "input",
                          {
                            type: "checkbox",
                            checked: !!status.allowLan,
                            onChange: toggleLan,
                            style: { opacity: 0, width: 0, height: 0, margin: 0 }
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "span",
                          {
                            style: {
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: status.allowLan ? "#ef4444" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.3))",
                              boxShadow: status.allowLan ? "0 0 10px rgba(239, 68, 68, 0.45)" : "none",
                              transition: "all 0.25s ease",
                              borderRadius: "24px"
                            }
                          }
                        ),
                        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                          "span",
                          {
                            style: {
                              position: "absolute",
                              top: "3px",
                              left: "3px",
                              width: "18px",
                              height: "18px",
                              backgroundColor: "#ffffff",
                              borderRadius: "50%",
                              boxShadow: "0 2px 4px rgba(0, 0, 0, 0.25)",
                              transform: status.allowLan ? "translateX(20px)" : "translateX(0px)",
                              transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
                            }
                          }
                        )
                      ]
                    }
                  )
                ] })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                fontSize: "13px",
                fontFamily: "monospace",
                color: "var(--dsw-alias-brand-primary, #3b82f6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "6px 10px",
                background: "var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.08))",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.15))",
                borderRadius: "8px"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "span",
                  {
                    style: {
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0
                    },
                    children: `http://${lanHost}:${port}`
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => copyText(`http://${lanHost}:${port}`, t("copiedTip", lang)),
                    style: {
                      padding: "3px 10px",
                      background: "var(--dsw-alias-bg-layer-3, rgba(255, 255, 255, 0.08))",
                      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                      borderRadius: "4px",
                      fontSize: "11px",
                      cursor: "pointer",
                      color: "var(--dsw-alias-label-secondary, inherit)",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    },
                    children: t("copyUrlBtn", lang)
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "div",
            {
              style: {
                marginTop: "4px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: status.allowLan ? "rgba(239, 68, 68, 0.12)" : "rgba(245, 158, 11, 0.08)",
                border: status.allowLan ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(245, 158, 11, 0.25)",
                borderLeft: status.allowLan ? "4px solid #ef4444" : "4px solid #f59e0b",
                boxShadow: status.allowLan ? "0 2px 8px rgba(239, 68, 68, 0.15)" : "none"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      fontWeight: "700",
                      color: status.allowLan ? "#ef4444" : "#f59e0b",
                      marginBottom: "4px"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status.allowLan ? "\u{1F6A8}" : "\u26A0\uFE0F" }),
                      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("lanBypassWarningTitle", lang) })
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      lineHeight: "1.55",
                      color: status.allowLan ? "var(--dsw-alias-label-primary, #fca5a5)" : "var(--dsw-alias-label-secondary, #cbd5e1)"
                    },
                    children: t("lanBypassDesc", lang)
                  }
                )
              ]
            }
          )
        ] })
      ]
    }
  );
}

// src/client/components/QrPairingCard.jsx
var import_react2 = __toESM(require("react"), 1);

// src/client/utils/format.js
function formatTime(ts, lang) {
  if (!ts) return lang === "en" ? "Unknown" : "\u672A\u77E5\u65F6\u95F4";
  var date = new Date(ts);
  var now = /* @__PURE__ */ new Date();
  var isToday = date.toDateString() === now.toDateString();
  var pad = function(n) {
    return n < 10 ? "0" + n : n;
  };
  var timeStr = pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  if (isToday) {
    return (lang === "en" ? "Today " : "\u4ECA\u5929 ") + timeStr;
  }
  if (lang === "en") {
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[date.getMonth()] + " " + date.getDate() + " " + timeStr;
  }
  return date.getMonth() + 1 + "\u6708" + date.getDate() + "\u65E5 " + timeStr;
}
function formatCountdown(sec, lang) {
  if (sec <= 0) return lang === "en" ? "Expired" : "\u5DF2\u8FC7\u671F";
  var m = Math.floor(sec / 60);
  var s = sec % 60;
  if (lang === "en") {
    return (m > 0 ? m + "m " : "") + (s < 10 ? "0" + s : s) + "s";
  }
  return (m > 0 ? m + " \u5206 " : "") + (s < 10 ? "0" + s : s) + " \u79D2";
}

// src/client/components/QrPairingCard.jsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function QrPairingCard({
  status,
  showCode,
  setShowCode,
  timeLeft,
  showQr,
  setShowQr,
  selectedTab,
  setSelectedTab,
  generateQrSvg: generateQrSvg2,
  refreshStatusAndCode,
  copyDirectLink,
  lang
}) {
  const port = typeof window !== "undefined" && window.location.port || "3080";
  const isExpired = timeLeft <= 0;
  const currentHost = selectedTab === "lan" && status.lanIp ? status.lanIp : status.tailscaleIp || status.lanIp || typeof window !== "undefined" && window.location.hostname || "127.0.0.1";
  const directLink = `http://${currentHost}:${port}/auth?token=${status.code || ""}`;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px",
        textAlign: "center"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            style: {
              fontSize: "15px",
              fontWeight: "600",
              marginBottom: "4px",
              color: "var(--dsw-alias-label-primary, inherit)"
            },
            children: `\u{1F4F1} ${t("shortCodeTitle", lang)}`
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              marginBottom: "14px"
            },
            children: t("pairingCardDesc", lang)
          }
        ),
        showQr ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            style: {
              background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
              borderRadius: "10px",
              padding: "16px",
              maxWidth: "320px",
              margin: "0 auto 16px auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    width: "100%",
                    background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.1))",
                    padding: "3px",
                    borderRadius: "8px"
                  },
                  children: [
                    status.tailscaleIp ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "button",
                      {
                        type: "button",
                        onClick: () => setSelectedTab("tailscale"),
                        style: {
                          flex: 1,
                          padding: "5px 8px",
                          borderRadius: "6px",
                          border: "none",
                          background: selectedTab === "tailscale" ? "var(--dsw-alias-brand-primary, #3b82f6)" : "transparent",
                          color: selectedTab === "tailscale" ? "#ffffff" : "var(--dsw-alias-label-secondary, inherit)",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        children: `\u{1F680} ${t("switchTailscaleTab", lang)}`
                      }
                    ) : null,
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "button",
                      {
                        type: "button",
                        onClick: () => setSelectedTab("lan"),
                        style: {
                          flex: 1,
                          padding: "5px 8px",
                          borderRadius: "6px",
                          border: "none",
                          background: selectedTab === "lan" ? "var(--dsw-alias-brand-primary, #3b82f6)" : "transparent",
                          color: selectedTab === "lan" ? "#ffffff" : "var(--dsw-alias-label-secondary, inherit)",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        children: `\u{1F3E0} ${t("switchLanTab", lang)}`
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "center",
                    opacity: isExpired ? 0.3 : 1
                  },
                  dangerouslySetInnerHTML: {
                    __html: generateQrSvg2(directLink, 170)
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "div",
                {
                  style: {
                    width: "100%",
                    padding: "6px 10px",
                    background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.12))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
                    borderRadius: "6px",
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: isExpired ? "var(--dsw-alias-label-error, #ef4444)" : "var(--dsw-alias-label-secondary, inherit)",
                    wordBreak: "break-all",
                    userSelect: "all",
                    lineHeight: "1.4",
                    textAlign: "center"
                  },
                  children: [
                    `http://${currentHost}:${port}/auth?token=`,
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "span",
                      {
                        style: {
                          fontWeight: "700",
                          color: showCode ? "var(--dsw-alias-brand-primary, #3b82f6)" : "inherit",
                          letterSpacing: showCode ? "1px" : "2px"
                        },
                        children: showCode ? status.code || "" : "\u2022\u2022\u2022\u2022\u2022\u2022"
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  onClick: copyDirectLink,
                  style: {
                    padding: "6px 16px",
                    background: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)",
                    transition: "background-color 0.2s"
                  },
                  children: status.copied ? `\u2705 ${lang === "en" ? "Copied!" : "\u5DF2\u590D\u5236\uFF01"}` : t("copyDirectAuthLink", lang)
                }
              )
            ]
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.1))",
              border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
              borderRadius: "10px",
              padding: "6px 20px",
              margin: "4px auto 8px auto"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "span",
                {
                  style: {
                    fontSize: "32px",
                    fontWeight: "800",
                    letterSpacing: showCode ? "6px" : "4px",
                    color: isExpired ? "var(--dsw-alias-label-error, #ef4444)" : "var(--dsw-alias-brand-primary, #3b82f6)",
                    fontFamily: "monospace",
                    userSelect: "all"
                  },
                  children: isExpired ? lang === "en" ? "EXPIRED" : "\u5DF2\u8FC7\u671F" : showCode ? status.code : "\u2022\u2022\u2022\u2022\u2022\u2022"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setShowCode(!showCode),
                  title: showCode ? t("clickToHide", lang) : t("clickToReveal", lang),
                  style: {
                    background: "transparent",
                    border: "none",
                    color: "var(--dsw-alias-label-secondary, #888)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px"
                  },
                  children: showCode ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { style: { width: "20px", height: "20px", fill: "currentColor" }, viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { style: { width: "20px", height: "20px", fill: "currentColor" }, viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" }) })
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: isExpired ? "var(--dsw-alias-label-error, #ef4444)" : "var(--dsw-alias-label-secondary, #888)",
              margin: "4px 0 16px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "span",
                {
                  style: {
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: isExpired ? "#ef4444" : "#10b981"
                  }
                }
              ),
              isExpired ? `\u26A0\uFE0F ${t("codeExpired", lang)}` : `${t("codeValidUntil", lang)}${formatCountdown(timeLeft, lang)}`
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              flexWrap: "wrap"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setShowQr(!showQr),
                  style: {
                    padding: "7px 16px",
                    background: showQr ? "rgba(59,130,246,0.15)" : "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.1))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                    color: showQr ? "var(--dsw-alias-brand-primary, #3b82f6)" : "var(--dsw-alias-label-primary, inherit)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0
                  },
                  children: showQr ? `\u{1F4F7} ${t("toggleQrHide", lang)}` : `\u{1F4F7} ${t("toggleQrShow", lang)}`
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  type: "button",
                  onClick: refreshStatusAndCode,
                  style: {
                    padding: "7px 16px",
                    background: "rgba(59,130,246,0.12)",
                    border: "1px solid rgba(59,130,246,0.3)",
                    color: "var(--dsw-alias-brand-primary, #3b82f6)",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0
                  },
                  children: t("refreshCodeBtn", lang)
                }
              )
            ]
          }
        )
      ]
    }
  );
}

// src/client/components/SecretCard.jsx
var import_react3 = __toESM(require("react"), 1);
var import_jsx_runtime3 = require("react/jsx-runtime");
function SecretCard({
  status,
  secretInput,
  setSecretInput,
  showSecret,
  setShowSecret,
  saveSecret,
  clearSecret,
  lang
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "style",
          {
            dangerouslySetInnerHTML: {
              __html: "input.dsh-secret-pwd-input::-ms-reveal, input.dsh-secret-pwd-input::-ms-clear, input.dsh-secret-pwd-input::-webkit-credentials-auto-fill-button, input.dsh-secret-pwd-input::-webkit-contacts-auto-fill-button { display: none !important; width: 0 !important; height: 0 !important; visibility: hidden !important; pointer-events: none !important; }"
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "4px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "div",
                {
                  style: {
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "var(--dsw-alias-label-primary, inherit)"
                  },
                  children: t("secretCardTitle", lang)
                }
              ),
              status.hasSecret ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "span",
                {
                  style: {
                    fontSize: "12px",
                    color: "#10b981",
                    background: "rgba(16,185,129,0.12)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: "500"
                  },
                  children: t("secretConfigured", lang)
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "span",
                {
                  style: {
                    fontSize: "12px",
                    color: "var(--dsw-alias-label-tertiary, #888)"
                  },
                  children: t("secretNotConfigured", lang)
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              marginBottom: "12px"
            },
            children: t("secretCardDesc", lang)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "div",
            {
              style: {
                position: "relative",
                flex: "1 1 200px",
                minWidth: "200px",
                display: "flex",
                alignItems: "center"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "input",
                  {
                    className: "dsh-secret-pwd-input",
                    type: showSecret ? "text" : "password",
                    value: secretInput,
                    placeholder: status.hasSecret ? lang === "en" ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (Password configured, enter new to update)" : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022 (\u5DF2\u914D\u7F6E\u6709\u6548\u5BC6\u7801\uFF0C\u8F93\u5165\u65B0\u5BC6\u7801\u53EF\u8986\u76D6\u66F4\u65B0)" : t("secretInputPlaceholder", lang),
                    onChange: (e) => setSecretInput(e.target.value),
                    style: {
                      width: "100%",
                      height: "38px",
                      background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.1))",
                      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                      borderRadius: "8px",
                      padding: "0 38px 0 12px",
                      color: "inherit",
                      fontSize: "14px",
                      outline: "none"
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowSecret(!showSecret),
                    title: showSecret ? t("hidePassword", lang) : t("showPassword", lang),
                    style: {
                      position: "absolute",
                      right: "8px",
                      background: "transparent",
                      border: "none",
                      color: "var(--dsw-alias-label-secondary, #888)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "4px"
                    },
                    children: showSecret ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { style: { width: "18px", height: "18px", fill: "currentColor" }, viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" }) }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { style: { width: "18px", height: "18px", fill: "currentColor" }, viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" }) })
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              onClick: saveSecret,
              style: {
                padding: "0 16px",
                height: "38px",
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)"
              },
              children: t("saveSecretBtn", lang)
            }
          ),
          status.hasSecret ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              onClick: clearSecret,
              title: t("clearSecretConfirm", lang),
              style: {
                padding: "0 12px",
                height: "38px",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "500",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0
              },
              children: t("clearSecretBtn", lang)
            }
          ) : null
        ] })
      ]
    }
  );
}

// src/client/components/DeviceListCard.jsx
var import_react4 = __toESM(require("react"), 1);
var import_jsx_runtime4 = require("react/jsx-runtime");
function isCurrentLocalIp(ip, status) {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  if (status && status.lanIp && ip === status.lanIp) return true;
  if (status && status.tailscaleIp && ip === status.tailscaleIp) return true;
  if (typeof window !== "undefined" && window.location && window.location.hostname && ip === window.location.hostname)
    return true;
  return false;
}
function DeviceListCard({ status, revokeDevice, revokeAll, lang }) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px 12px",
              marginBottom: "6px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "div",
                {
                  style: {
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "var(--dsw-alias-label-primary, inherit)"
                  },
                  children: `\u{1F4F1} ${t("deviceCardTitle", lang)} (${status.devicesCount}${lang === "en" ? " devices" : " \u53F0"})`
                }
              ),
              status.devicesCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  onClick: revokeAll,
                  style: {
                    background: "transparent",
                    border: "1px solid rgba(239,68,68,0.4)",
                    color: "var(--dsw-alias-label-error, #ef4444)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginLeft: "auto"
                  },
                  children: t("revokeAllBtn", lang)
                }
              ) : null
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              lineHeight: "1.45",
              marginBottom: "14px"
            },
            children: t("deviceCardDesc", lang)
          }
        ),
        status.devices && status.devices.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: status.devices.map((dev) => {
          const isLocal = isCurrentLocalIp(dev.ip, status);
          const ipLabel = `${dev.ip}${isLocal ? lang === "en" ? " (Local)" : " (\u672C\u673A)" : ""}`;
          return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "12px 14px",
                background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.08))",
                border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
                borderRadius: "8px"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      minWidth: 0,
                      flex: 1
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                        "div",
                        {
                          style: {
                            fontSize: "14px",
                            fontWeight: "600",
                            color: "var(--dsw-alias-label-primary, inherit)",
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "8px"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: formatDeviceName(dev.deviceName, lang) }),
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                              "span",
                              {
                                style: {
                                  fontSize: "11px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: dev.isBypass ? "rgba(16,185,129,0.15)" : "rgba(59,130,246,0.15)",
                                  color: dev.isBypass ? "#10b981" : "var(--dsw-alias-brand-primary, #3b82f6)",
                                  fontWeight: "normal",
                                  whiteSpace: "nowrap"
                                },
                                children: formatAuthType(dev.authType, lang)
                              }
                            )
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                        "div",
                        {
                          style: {
                            fontSize: "12px",
                            color: "var(--dsw-alias-label-tertiary, #888)",
                            lineHeight: "1.4",
                            wordBreak: "break-word"
                          },
                          children: [
                            lang === "en" ? "IP: " : "\u6765\u6E90 IP: ",
                            ipLabel,
                            lang === "en" ? " \xB7 Authorized: " : " \xB7 \u6388\u6743\u4E8E ",
                            formatTime(dev.createdAt, lang),
                            lang === "en" ? " \xB7 Last seen: " : " \xB7 \u6700\u8FD1\u6D3B\u8DC3 ",
                            formatTime(dev.lastSeenAt, lang)
                          ]
                        }
                      )
                    ]
                  }
                ),
                !dev.isBypass ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => revokeDevice(dev.token),
                    style: {
                      padding: "5px 12px",
                      background: "transparent",
                      border: "1px solid rgba(239,68,68,0.3)",
                      color: "var(--dsw-alias-label-error, #ef4444)",
                      borderRadius: "6px",
                      fontSize: "12px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    },
                    children: t("revokeDeviceBtn", lang)
                  }
                ) : null
              ]
            },
            dev.token
          );
        }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "div",
          {
            style: {
              textAlign: "center",
              padding: "16px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              fontSize: "13px"
            },
            children: t("noDevices", lang)
          }
        )
      ]
    }
  );
}

// src/client/components/SecurityCard.jsx
var import_react5 = __toESM(require("react"), 1);
var import_jsx_runtime5 = require("react/jsx-runtime");
function isCurrentLocalIp2(ip, status) {
  if (!ip) return false;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  if (status && status.lanIp && ip === status.lanIp) return true;
  if (status && status.tailscaleIp && ip === status.tailscaleIp) return true;
  if (typeof window !== "undefined" && window.location && window.location.hostname && ip === window.location.hostname)
    return true;
  return false;
}
function SecurityCard({ status, unlockIp, clearIpStats, lang }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px 12px",
              marginBottom: "8px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontSize: "16px", flexShrink: 0 }, children: "\u{1F6E1}\uFE0F" }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "span",
                  {
                    style: {
                      fontSize: "15px",
                      fontWeight: "600",
                      color: "var(--dsw-alias-label-primary, inherit)"
                    },
                    children: t("securityCardTitle", lang)
                  }
                )
              ] }),
              status.ipSecurityStats && status.ipSecurityStats.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  type: "button",
                  onClick: clearIpStats,
                  style: {
                    background: "transparent",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                    color: "var(--dsw-alias-label-secondary, inherit)",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginLeft: "auto"
                  },
                  children: t("clearSecurityLogBtn", lang)
                }
              ) : null
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              marginBottom: "8px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "span",
                {
                  style: {
                    fontSize: "12px",
                    color: "#10b981",
                    background: "rgba(16,185,129,0.12)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: "500"
                  },
                  children: lang === "en" ? `\u23F1\uFE0F IP Rate Limit: ${status.maxVisitsPerMinute || 60}/min` : `\u23F1\uFE0F \u5355 IP \u9650\u9891 ${status.maxVisitsPerMinute || 60}\u6B21/\u5206\u949F`
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "span",
                {
                  style: {
                    fontSize: "12px",
                    color: "#10b981",
                    background: "rgba(16,185,129,0.12)",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: "500"
                  },
                  children: lang === "en" ? `\u{1F6E1}\uFE0F Lockout: ${status.maxFailedAttempts || 5} fails / ${Math.round(
                    (status.lockDurationMs || 9e5) / 6e4
                  )} mins` : `\u{1F6E1}\uFE0F \u8FDE\u7EED ${status.maxFailedAttempts || 5} \u6B21\u9519\u8BEF\u5C01\u9501 ${Math.round(
                    (status.lockDurationMs || 9e5) / 6e4
                  )} \u5206\u949F`
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              marginBottom: "12px",
              lineHeight: "1.5"
            },
            children: t("securityCardDesc", lang)
          }
        ),
        status.ipSecurityStats && status.ipSecurityStats.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: status.ipSecurityStats.map((stat) => {
          const isLocked = stat.lockedUntil && stat.lockedUntil > Date.now();
          const remMin = isLocked ? Math.ceil((stat.lockedUntil - Date.now()) / 6e4) : 0;
          const matchedDevice = status.devices && Array.isArray(status.devices) ? status.devices.find((d) => d.ip === stat.ip) : null;
          let effectiveAuthType = stat.authType;
          if (!effectiveAuthType || effectiveAuthType === "\u26AA \u5F85\u8BA4\u8BC1" || effectiveAuthType === "\u26AA Pending") {
            if (matchedDevice) {
              if (matchedDevice.authType && matchedDevice.authType.indexOf("\u514D\u5BC6") !== -1) {
                effectiveAuthType = lang === "en" ? "\u26A1 Bypass Access" : matchedDevice.authType;
              } else if (matchedDevice.authType && matchedDevice.authType.indexOf("\u5BC6\u7801") !== -1) {
                effectiveAuthType = lang === "en" ? "\u{1F511} Password Auth" : "\u{1F511} \u957F\u671F\u5BC6\u7801\u8BA4\u8BC1";
              } else {
                effectiveAuthType = lang === "en" ? "\u{1F4F1} QR Pairing Auth" : "\u{1F4F1} \u626B\u7801\u914D\u5BF9\u8BA4\u8BC1";
              }
            }
          }
          let effectiveDeviceName = stat.deviceName;
          if (!effectiveDeviceName && matchedDevice && matchedDevice.deviceName) {
            effectiveDeviceName = matchedDevice.deviceName;
          }
          const isLocal = isCurrentLocalIp2(stat.ip, status);
          const ipLabel = `${stat.ip}${isLocal ? lang === "en" ? " (Local)" : " (\u672C\u673A)" : ""}`;
          return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 14px",
                background: isLocked ? "rgba(239,68,68,0.08)" : "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.08))",
                border: isLocked ? "1px solid rgba(239,68,68,0.3)" : "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.1))",
                borderRadius: "8px"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                  "div",
                  {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                      minWidth: 0,
                      flex: 1
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                        "div",
                        {
                          style: {
                            fontSize: "13px",
                            fontWeight: "600",
                            color: "var(--dsw-alias-label-primary, inherit)",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap"
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontWeight: "600" }, children: stat.deviceName ? `${formatDeviceName(stat.deviceName, lang)} \xB7 ${stat.ip}${isLocal ? lang === "en" ? " (Local)" : " (\u672C\u673A)" : ""}` : `${stat.ip}${isLocal ? lang === "en" ? " (Local)" : " (\u672C\u673A)" : ""}` }),
                            effectiveAuthType ? (() => {
                              const translatedAuth = formatAuthType(effectiveAuthType, lang);
                              let bg = "rgba(59,130,246,0.12)";
                              let color = "#3b82f6";
                              if (effectiveAuthType.indexOf("\u514D\u5BC6") !== -1 || effectiveAuthType.indexOf("Bypass") !== -1) {
                                bg = "rgba(16,185,129,0.15)";
                                color = "#10b981";
                              } else if (effectiveAuthType.indexOf("\u626B\u7801") !== -1 || effectiveAuthType.indexOf("Pairing") !== -1 || effectiveAuthType.indexOf("QR") !== -1) {
                                bg = "rgba(59,130,246,0.15)";
                                color = "#3b82f6";
                              } else if (effectiveAuthType.indexOf("\u5BC6\u7801") !== -1 || effectiveAuthType.indexOf("Password") !== -1) {
                                bg = "rgba(139,92,246,0.15)";
                                color = "#a78bfa";
                              }
                              return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                                "span",
                                {
                                  style: {
                                    fontSize: "11px",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    background: bg,
                                    color,
                                    fontWeight: "600",
                                    whiteSpace: "nowrap"
                                  },
                                  children: translatedAuth
                                }
                              );
                            })() : null,
                            isLocked ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                              "span",
                              {
                                style: {
                                  fontSize: "11px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(239,68,68,0.2)",
                                  color: "#ef4444",
                                  fontWeight: "700",
                                  whiteSpace: "nowrap"
                                },
                                children: lang === "en" ? `\u{1F6AB} Locked (${remMin}m left)` : `\u{1F6AB} \u5DF2\u88AB\u9501\u5B9A (\u8FD8\u5269 ${remMin} \u5206\u949F)`
                              }
                            ) : stat.failedAttempts > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                              "span",
                              {
                                style: {
                                  fontSize: "11px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(245,158,11,0.2)",
                                  color: "#f59e0b",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap"
                                },
                                children: formatFailedAttempts(stat.failedAttempts, lang)
                              }
                            ) : !effectiveAuthType ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                              "span",
                              {
                                style: {
                                  fontSize: "11px",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  background: "rgba(148,163,184,0.15)",
                                  color: "#94a3b8",
                                  fontWeight: "600",
                                  whiteSpace: "nowrap"
                                },
                                children: lang === "en" ? "\u26AA Pending" : "\u26AA \u5F85\u8BA4\u8BC1"
                              }
                            ) : null
                          ]
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                        "div",
                        {
                          style: {
                            fontSize: "11px",
                            color: "var(--dsw-alias-label-tertiary, #888)",
                            lineHeight: "1.4",
                            wordBreak: "break-word"
                          },
                          children: lang === "en" ? `Visits: ${stat.authVisits} \xB7 Attempts: ${stat.totalAttempts} \xB7 Consecutive fails: ${stat.failedAttempts} \xB7 Last seen: ${formatTime(stat.lastSeenAt, lang)}` : `\u6253\u5F00\u767B\u5F55\u9875 ${stat.authVisits} \u6B21 \xB7 \u5C1D\u8BD5\u914D\u5BF9 ${stat.totalAttempts} \u6B21 \xB7 \u8FDE\u7EED\u5931\u8D25 ${stat.failedAttempts} \u6B21 \xB7 \u6700\u8FD1\u8BBF\u95EE ${formatTime(stat.lastSeenAt, lang)}`
                        }
                      )
                    ]
                  }
                ),
                isLocked ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => unlockIp(stat.ip),
                    style: {
                      padding: "5px 12px",
                      background: "rgba(59,130,246,0.12)",
                      border: "1px solid rgba(59,130,246,0.3)",
                      color: "var(--dsw-alias-brand-primary, #3b82f6)",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      flexShrink: 0
                    },
                    children: t("unlockIpBtn", lang)
                  }
                ) : null
              ]
            },
            stat.ip
          );
        }) }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            style: {
              textAlign: "center",
              padding: "14px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              fontSize: "13px"
            },
            children: t("securityNormal", lang)
          }
        )
      ]
    }
  );
}

// src/client/components/StorageCard.jsx
var import_react6 = __toESM(require("react"), 1);
var import_jsx_runtime6 = require("react/jsx-runtime");
function StorageCard({ status, lang, copyText }) {
  const handleCopy = (path, tip) => {
    if (!path) return;
    if (typeof copyText === "function") {
      copyText(path, tip);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(path).catch(() => {
      });
    }
  };
  const devicesPath = status.persistPath || "";
  const rsaPath = status.rsaKeyPath || "";
  const stylesPath = status.styleSnippetsPath || "";
  const items = [
    {
      icon: "\u{1F4C1}",
      title: t("storageDeviceFile", lang),
      path: devicesPath,
      tip: lang === "en" ? "Devices storage path copied!" : "\u5DF2\u6210\u529F\u590D\u5236\u8BBE\u5907\u5B58\u50A8\u6587\u4EF6\u8DEF\u5F84\uFF01"
    },
    {
      icon: "\u{1F511}",
      title: t("storageRsaFile", lang),
      path: rsaPath,
      tip: lang === "en" ? "RSA key path copied!" : "\u5DF2\u6210\u529F\u590D\u5236 RSA \u5BC6\u94A5\u6587\u4EF6\u8DEF\u5F84\uFF01"
    },
    {
      icon: "\u{1F3A8}",
      title: t("storageStylesFile", lang),
      path: stylesPath,
      tip: lang === "en" ? "Style snippets path copied!" : "\u5DF2\u6210\u529F\u590D\u5236\u6837\u5F0F\u7247\u6BB5\u6587\u4EF6\u8DEF\u5F84\uFF01"
    }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.04))",
        border: "1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
        borderRadius: "10px",
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      },
      children: items.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            paddingTop: index > 0 ? "8px" : "0",
            borderTop: index > 0 ? "1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,0.15))" : "none"
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { style: { fontSize: "18px", flexShrink: 0 }, children: item.icon }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "var(--dsw-alias-label-primary, inherit)"
                    },
                    children: item.title
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                  "code",
                  {
                    style: {
                      fontSize: "11px",
                      color: "var(--dsw-alias-brand-primary, #3b82f6)",
                      fontFamily: "monospace",
                      wordBreak: "break-all"
                    },
                    children: item.path || "..."
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                type: "button",
                onClick: () => handleCopy(item.path, item.tip),
                style: {
                  padding: "4px 10px",
                  background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.1))",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                  color: "var(--dsw-alias-label-secondary, inherit)",
                  borderRadius: "6px",
                  fontSize: "11px",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0
                },
                children: t("copyUrlBtn", lang)
              }
            )
          ]
        },
        index
      ))
    }
  );
}

// src/client/components/ConfigCard.jsx
var import_react7 = __toESM(require("react"), 1);
var import_jsx_runtime7 = require("react/jsx-runtime");
function ConfigCard({
  maxVisitsInput,
  setMaxVisitsInput,
  maxFailedInput,
  setMaxFailedInput,
  lockDurationMinsInput,
  setLockDurationMinsInput,
  saveAdvancedConfig,
  resetAdvancedConfigDefaults,
  isSaving,
  lang,
  copyText
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "8px 12px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { fontSize: "16px" }, children: "\u2699\uFE0F" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  "span",
                  {
                    style: {
                      fontSize: "15px",
                      fontWeight: "600",
                      color: "var(--dsw-alias-label-primary, inherit)"
                    },
                    children: t("configCardTitle", lang)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (typeof copyText === "function") {
                      copyText(
                        "~/.dsh/settings.yaml",
                        lang === "en" ? "Settings path copied (~/.dsh/settings.yaml)" : "\u5DF2\u590D\u5236\u914D\u7F6E\u6587\u4EF6\u8DEF\u5F84\uFF08~/.dsh/settings.yaml\uFF09"
                      );
                    }
                  },
                  style: {
                    padding: "4px 10px",
                    background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.1))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                    color: "var(--dsw-alias-label-secondary, inherit)",
                    borderRadius: "6px",
                    fontSize: "11px",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginLeft: "auto"
                  },
                  children: t("copySettingsPathBtn", lang)
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              color: "var(--dsw-alias-label-tertiary, #888)",
              lineHeight: "1.5"
            },
            children: t("configCardDesc", lang)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
          "div",
          {
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "12px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "label",
                      {
                        style: {
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "var(--dsw-alias-label-primary, inherit)"
                        },
                        children: t("fieldVisitsLimit", lang)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        type: "number",
                        min: "1",
                        max: "1000",
                        value: maxVisitsInput,
                        onChange: (e) => setMaxVisitsInput(e.target.value),
                        placeholder: "60",
                        style: {
                          height: "34px",
                          background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.15))",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          borderRadius: "6px",
                          padding: "0 10px",
                          color: "inherit",
                          fontSize: "13px",
                          outline: "none"
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)" }, children: t("fieldVisitsLimitHint", lang) })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "label",
                      {
                        style: {
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "var(--dsw-alias-label-primary, inherit)"
                        },
                        children: t("fieldFailedLimit", lang)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        type: "number",
                        min: "1",
                        max: "100",
                        value: maxFailedInput,
                        onChange: (e) => setMaxFailedInput(e.target.value),
                        placeholder: "5",
                        style: {
                          height: "34px",
                          background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.15))",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          borderRadius: "6px",
                          padding: "0 10px",
                          color: "inherit",
                          fontSize: "13px",
                          outline: "none"
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)" }, children: t("fieldFailedLimitHint", lang) })
                  ]
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                "div",
                {
                  style: {
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
                    borderRadius: "8px",
                    padding: "10px 12px"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "label",
                      {
                        style: {
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "var(--dsw-alias-label-primary, inherit)"
                        },
                        children: t("fieldLockDuration", lang)
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                      "input",
                      {
                        type: "number",
                        min: "1",
                        max: "1440",
                        value: lockDurationMinsInput,
                        onChange: (e) => setLockDurationMinsInput(e.target.value),
                        placeholder: "15",
                        style: {
                          height: "34px",
                          background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.15))",
                          border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                          borderRadius: "6px",
                          padding: "0 10px",
                          color: "inherit",
                          fontSize: "13px",
                          outline: "none"
                        }
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)" }, children: t("fieldLockDurationHint", lang) })
                  ]
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "4px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                "button",
                {
                  type: "button",
                  onClick: resetAdvancedConfigDefaults,
                  disabled: isSaving,
                  style: {
                    padding: "6px 14px",
                    background: "transparent",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                    color: "var(--dsw-alias-label-secondary, inherit)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    cursor: isSaving ? "not-allowed" : "pointer",
                    opacity: isSaving ? 0.6 : 1,
                    whiteSpace: "nowrap"
                  },
                  children: t("restoreDefaultsBtn", lang)
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                "button",
                {
                  type: "button",
                  onClick: saveAdvancedConfig,
                  disabled: isSaving,
                  style: {
                    padding: "6px 18px",
                    background: "#2563eb",
                    border: "none",
                    color: "#ffffff",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: isSaving ? "not-allowed" : "pointer",
                    opacity: isSaving ? 0.7 : 1,
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 6px rgba(37, 99, 235, 0.3)"
                  },
                  children: isSaving ? t("savingConfigBtn", lang) : t("saveConfigBtn", lang)
                }
              )
            ]
          }
        )
      ]
    }
  );
}

// src/client/components/StylesCard.jsx
var import_react8 = __toESM(require("react"), 1);
var import_jsx_runtime8 = require("react/jsx-runtime");
function StylesCard({ lang, showToast }) {
  const [snippets, setSnippets] = (0, import_react8.useState)([]);
  const [loading, setLoading] = (0, import_react8.useState)(true);
  const [editingId, setEditingId] = (0, import_react8.useState)(null);
  const [showForm, setShowForm] = (0, import_react8.useState)(false);
  const [name, setName] = (0, import_react8.useState)("");
  const [css, setCss] = (0, import_react8.useState)("");
  const [pcEnabled, setPcEnabled] = (0, import_react8.useState)(false);
  const [mobileEnabled, setMobileEnabled] = (0, import_react8.useState)(true);
  const [expanded, setExpanded] = (0, import_react8.useState)({});
  const [feedback, setFeedback] = (0, import_react8.useState)("");
  const showFeedback = (0, import_react8.useCallback)((msg, type = "success") => {
    if (typeof showToast === "function") {
      showToast(msg, type);
    } else {
      setFeedback(msg);
      setTimeout(() => setFeedback(""), 3500);
    }
  }, [showToast]);
  const load = (0, import_react8.useCallback)(() => {
    fetchStyles().then((data) => {
      setSnippets(data.snippets || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      showFeedback(t("stylesLoadFail", lang), "danger");
    });
  }, [lang, showFeedback]);
  (0, import_react8.useEffect)(() => {
    load();
  }, [load]);
  const toggle = (id, scope, enabled) => {
    toggleStyleApi(id, scope, enabled).then((data) => {
      if (data.success) {
        load();
        const scopeLabel = scope === "pc" ? lang === "en" ? "PC" : "PC \u7AEF" : lang === "en" ? "Mobile" : "\u79FB\u52A8\u7AEF";
        showFeedback(
          enabled ? lang === "en" ? scopeLabel + " enabled!" : scopeLabel + " \u5DF2\u542F\u7528\uFF01" : lang === "en" ? scopeLabel + " disabled!" : scopeLabel + " \u5DF2\u505C\u7528\uFF01",
          "success"
        );
      }
    });
  };
  const startEdit = (s) => {
    setEditingId(s.id);
    setShowForm(true);
    setName(s.name);
    setCss(s.css);
    setPcEnabled(s.pcEnabled !== false);
    setMobileEnabled(s.mobileEnabled !== false);
    setFeedback("");
  };
  const cancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    setName("");
    setCss("");
    setPcEnabled(false);
    setMobileEnabled(true);
    setFeedback("");
  };
  const save = () => {
    if (!name.trim() || !css.trim()) {
      alert(t("stylesFieldsRequired", lang));
      return;
    }
    saveStyleSnippet({
      id: editingId || void 0,
      name: name.trim(),
      css,
      pcEnabled,
      mobileEnabled
    }).then((data) => {
      if (data.success) {
        load();
        cancelEdit();
        showFeedback(t("stylesSaveSuccess", lang));
      } else {
        alert((lang === "en" ? "Save failed: " : "\u4FDD\u5B58\u5931\u8D25\uFF1A") + (data.reason || ""));
      }
    }).catch(() => {
      alert(lang === "en" ? "Network request failed, please try again." : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    });
  };
  const remove = (s) => {
    if (s.builtin) return;
    if (confirm(t("stylesDeleteConfirm", lang))) {
      deleteStyleSnippetApi(s.id).then((data) => {
        if (data.success) {
          if (editingId === s.id) cancelEdit();
          load();
          showFeedback(lang === "en" ? "Style snippet deleted!" : "\u81EA\u5B9A\u4E49\u6837\u5F0F\u7247\u6BB5\u5DF2\u5220\u9664\uFF01");
        }
      });
    }
  };
  const resetAll = () => {
    if (!confirm(t("stylesResetConfirm", lang))) return;
    resetStylesApi().then((data) => {
      if (data.success) {
        load();
        showFeedback(lang === "en" ? "Style snippets reset to defaults!" : "\u5DF2\u6062\u590D\u6240\u6709\u7247\u6BB5\u7684\u9ED8\u8BA4\u542F\u505C\u72B6\u6001\uFF01");
      }
    });
  };
  const toggleExpand = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const copyCss = (cssText) => {
    navigator.clipboard.writeText(cssText).then(() => showFeedback(t("stylesCopyCssDone", lang))).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = cssText;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showFeedback(t("stylesCopyCssDone", lang));
      } catch {
        showFeedback(lang === "en" ? "Copy failed, please copy manually." : "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236\u3002", "danger");
      }
      document.body.removeChild(ta);
    });
  };
  const scopeBadge = (s) => {
    if (s.pcEnabled && s.mobileEnabled) return t("stylesBothDevices", lang);
    if (s.mobileEnabled) return "\u{1F4F1} " + t("stylesMobileOnlyBadge", lang);
    if (s.pcEnabled) return "\u{1F5A5}\uFE0F " + t("stylesPcOnlyBadge", lang);
    return t("stylesDisabled", lang);
  };
  const rowStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.12))",
    borderRadius: "8px",
    padding: "10px 12px",
    boxSizing: "border-box",
    maxWidth: "100%",
    overflow: "hidden"
  };
  const miniBtnStyle = {
    padding: "4px 8px",
    background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.1))",
    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
    color: "var(--dsw-alias-label-secondary, inherit)",
    borderRadius: "6px",
    fontSize: "11px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0
  };
  const primaryBtnStyle = {
    ...miniBtnStyle,
    background: "rgba(59,130,246,0.15)",
    color: "var(--dsw-alias-brand-primary, #3b82f6)",
    border: "1px solid rgba(59,130,246,0.3)"
  };
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
    "div",
    {
      style: {
        background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.06))",
        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
        borderRadius: "12px",
        padding: "14px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { fontSize: "16px" }, children: "\u{1F3A8}" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { fontSize: "15px", fontWeight: "600", color: "var(--dsw-alias-label-primary, inherit)" }, children: t("stylesCardTitle", lang) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: resetAll, style: miniBtnStyle, children: t("stylesResetAll", lang) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #888)", lineHeight: "1.5" }, children: t("stylesCardDesc", lang) }),
        feedback && typeof showToast !== "function" ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
          "div",
          {
            style: {
              fontSize: "12px",
              padding: "8px 12px",
              borderRadius: "8px",
              background: "rgba(16,185,129,0.12)",
              color: "var(--dsw-alias-success, #10b981)",
              border: "1px solid rgba(16,185,129,0.25)"
            },
            children: feedback
          }
        ) : null,
        loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #888)" }, children: lang === "en" ? "Loading style snippets..." : "\u6B63\u5728\u52A0\u8F7D\u6837\u5F0F\u7247\u6BB5..." }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
          snippets.some((s) => s.builtin) ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--dsw-alias-label-secondary, inherit)" }, children: t("stylesPresetsTitle", lang) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: snippets.filter((s) => s.builtin).map((s) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: rowStyle, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { flex: "1 1 180px", minWidth: 0, maxWidth: "100%" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { fontSize: "12px", fontWeight: "600", color: "var(--dsw-alias-label-primary, inherit)" }, children: s.name }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "span",
                      {
                        style: {
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "8px",
                          background: "rgba(139,92,246,0.15)",
                          color: "#8b5cf6",
                          fontWeight: "600"
                        },
                        children: "Preset"
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "span",
                      {
                        style: {
                          fontSize: "10px",
                          padding: "1px 6px",
                          borderRadius: "8px",
                          background: "rgba(59,130,246,0.12)",
                          color: "#3b82f6",
                          fontWeight: "600"
                        },
                        children: scopeBadge(s)
                      }
                    )
                  ] }),
                  s.description ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", marginTop: "3px" }, children: s.description }) : null
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px 8px", flexWrap: "wrap", maxWidth: "100%" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: s.pcEnabled,
                        onChange: (e) => toggle(s.id, "pc", e.target.checked),
                        style: { accentColor: "#3b82f6", width: "16px", height: "16px", cursor: "pointer" }
                      }
                    ),
                    "\u{1F5A5}\uFE0F ",
                    t("stylesPcShort", lang)
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: s.mobileEnabled,
                        onChange: (e) => toggle(s.id, "mobile", e.target.checked),
                        style: { accentColor: "#3b82f6", width: "16px", height: "16px", cursor: "pointer" }
                      }
                    ),
                    "\u{1F4F1} ",
                    t("stylesMobileShort", lang)
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: () => toggleExpand(s.id), style: miniBtnStyle, children: expanded[s.id] ? t("stylesHideCss", lang) : t("stylesViewCss", lang) }),
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: () => copyCss(s.css), style: miniBtnStyle, children: t("stylesCopyCss", lang) })
                  ] })
                ] })
              ] }),
              expanded[s.id] ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "pre",
                {
                  style: {
                    maxHeight: "180px",
                    overflow: "auto",
                    fontSize: "11px",
                    lineHeight: "1.5",
                    margin: 0,
                    padding: "8px 10px",
                    background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.25))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
                    borderRadius: "6px",
                    color: "var(--dsw-alias-label-secondary, inherit)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)"
                  },
                  children: s.css
                }
              ) : null
            ] }, s.id)) })
          ] }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "13px", fontWeight: "600", color: "var(--dsw-alias-label-secondary, inherit)", marginTop: "4px" }, children: t("stylesCustomTitle", lang) }),
          !showForm ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "button",
            {
              type: "button",
              onClick: () => setShowForm(true),
              style: {
                width: "100%",
                padding: "12px",
                background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
                border: "1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                borderRadius: "8px",
                color: "var(--dsw-alias-brand-primary, #3b82f6)",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer"
              },
              children: t("stylesAddNew", lang)
            }
          ) : /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,0.06))",
                border: "1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                borderRadius: "8px",
                padding: "12px"
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "input",
                    {
                      type: "text",
                      value: name,
                      onChange: (e) => setName(e.target.value),
                      placeholder: t("stylesNamePlaceholder", lang),
                      style: {
                        flex: 1,
                        minWidth: "160px",
                        padding: "8px 10px",
                        fontSize: "12px",
                        borderRadius: "6px",
                        border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                        background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))",
                        color: "var(--dsw-alias-label-primary, inherit)",
                        outline: "none"
                      }
                    }
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: pcEnabled,
                        onChange: (e) => setPcEnabled(e.target.checked),
                        style: { accentColor: "#3b82f6", width: "16px", height: "16px", cursor: "pointer" }
                      }
                    ),
                    "\u{1F5A5}\uFE0F ",
                    t("stylesPcShort", lang)
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                      "input",
                      {
                        type: "checkbox",
                        checked: mobileEnabled,
                        onChange: (e) => setMobileEnabled(e.target.checked),
                        style: { accentColor: "#3b82f6", width: "16px", height: "16px", cursor: "pointer" }
                      }
                    ),
                    "\u{1F4F1} ",
                    t("stylesMobileShort", lang)
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                  "textarea",
                  {
                    value: css,
                    onChange: (e) => setCss(e.target.value),
                    placeholder: t("stylesCssPlaceholder", lang),
                    rows: 5,
                    style: {
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "8px 10px",
                      fontSize: "12px",
                      lineHeight: "1.5",
                      borderRadius: "6px",
                      border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))",
                      background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))",
                      color: "var(--dsw-alias-label-primary, inherit)",
                      fontFamily: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)",
                      outline: "none",
                      resize: "vertical"
                    }
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: save, style: primaryBtnStyle, children: t("stylesSave", lang) }),
                  editingId !== null ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: cancelEdit, style: miniBtnStyle, children: t("stylesCancelEdit", lang) }) : null,
                  showForm && !editingId ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: cancelEdit, style: miniBtnStyle, children: t("stylesCancelEdit", lang) }) : null
                ] })
              ]
            }
          ),
          snippets.filter((s) => !s.builtin).length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary, #888)" }, children: t("stylesEmptyCustom", lang) }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: snippets.filter((s) => !s.builtin).map((s) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: rowStyle, children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { flex: "1 1 180px", minWidth: 0, maxWidth: "100%" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { style: { fontSize: "12px", fontWeight: "600", color: "var(--dsw-alias-label-primary, inherit)" }, children: s.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "span",
                    {
                      style: {
                        fontSize: "10px",
                        padding: "1px 6px",
                        borderRadius: "8px",
                        background: "rgba(59,130,246,0.12)",
                        color: "#3b82f6",
                        fontWeight: "600"
                      },
                      children: scopeBadge(s)
                    }
                  )
                ] }),
                s.description ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", marginTop: "3px" }, children: s.description }) : null
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px 8px", flexWrap: "wrap", maxWidth: "100%" }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: s.pcEnabled,
                      onChange: (e) => toggle(s.id, "pc", e.target.checked),
                      style: { accentColor: "#3b82f6", width: "16px", height: "16px", cursor: "pointer" }
                    }
                  ),
                  "\u{1F5A5}\uFE0F ",
                  t("stylesPcShort", lang)
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("label", { style: { display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "input",
                    {
                      type: "checkbox",
                      checked: s.mobileEnabled,
                      onChange: (e) => toggle(s.id, "mobile", e.target.checked),
                      style: { accentColor: "#3b82f6", width: "16px", height: "16px", cursor: "pointer" }
                    }
                  ),
                  "\u{1F4F1} ",
                  t("stylesMobileShort", lang)
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { style: { display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: () => startEdit(s), style: miniBtnStyle, children: t("stylesEditBtn", lang) }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: () => remove(s), style: { ...miniBtnStyle, color: "#ef4444" }, children: t("stylesDeleteBtn", lang) }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: () => toggleExpand(s.id), style: miniBtnStyle, children: expanded[s.id] ? t("stylesHideCss", lang) : t("stylesViewCss", lang) }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { type: "button", onClick: () => copyCss(s.css), style: miniBtnStyle, children: t("stylesCopyCss", lang) })
                ] })
              ] })
            ] }),
            expanded[s.id] ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "pre",
              {
                style: {
                  maxHeight: "180px",
                  overflow: "auto",
                  fontSize: "11px",
                  lineHeight: "1.5",
                  margin: 0,
                  padding: "8px 10px",
                  background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.25))",
                  border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.15))",
                  borderRadius: "6px",
                  color: "var(--dsw-alias-label-secondary, inherit)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace)"
                },
                children: s.css
              }
            ) : null
          ] }, s.id)) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { style: { fontSize: "11px", color: "var(--dsw-alias-label-tertiary, #888)", lineHeight: "1.6" }, children: t("stylesHint", lang) })
        ] })
      ]
    }
  );
}

// src/client/version.js
var PLUGIN_VERSION = "v1.7.0";
var BUILD_TIME = "2026-09-15 23:45:02";

// src/client/components/MainSection.jsx
var import_jsx_runtime9 = require("react/jsx-runtime");
function TailscaleMobileSection(props) {
  const ctx = props && props.ctx || typeof window !== "undefined" && window.__DSH_CLIENT_CTX__ || null;
  const [status, setStatus] = (0, import_react9.useState)({
    tailscaleIp: "",
    lanIp: "",
    code: "",
    expiresAt: 0,
    hasSecret: false,
    allowTailscale: false,
    allowLan: false,
    maxVisitsPerMinute: 60,
    maxFailedAttempts: 5,
    lockDurationMs: 9e5,
    devicesCount: 0,
    devices: [],
    ipSecurityStats: [],
    copied: false,
    loading: true,
    persistPath: "",
    rsaKeyPath: "",
    styleSnippetsPath: "",
    locale: "zh",
    pairingBridgeMode: "pending",
    pairingBridgeConflict: "",
    pairingBridgeConflictId: ""
  });
  const [secretInput, setSecretInput] = (0, import_react9.useState)("");
  const [showSecret, setShowSecret] = (0, import_react9.useState)(false);
  const [showCode, setShowCode] = (0, import_react9.useState)(false);
  const [showQr, setShowQr] = (0, import_react9.useState)(false);
  const [selectedTab, setSelectedTab] = (0, import_react9.useState)("lan");
  const [timeLeft, setTimeLeft] = (0, import_react9.useState)(300);
  const [toast, setToast] = (0, import_react9.useState)(null);
  const [maxVisitsInput, setMaxVisitsInput] = (0, import_react9.useState)("60");
  const [maxFailedInput, setMaxFailedInput] = (0, import_react9.useState)("5");
  const [lockDurationMinsInput, setLockDurationMinsInput] = (0, import_react9.useState)("15");
  const [isSaving, setIsSaving] = (0, import_react9.useState)(false);
  const [showVersionTip, setShowVersionTip] = (0, import_react9.useState)(false);
  const [currentLang, setCurrentLang] = (0, import_react9.useState)(resolveLocale(ctx, status));
  const [npmLatestVersion, setNpmLatestVersion] = (0, import_react9.useState)("");
  const [hasUpdate, setHasUpdate] = (0, import_react9.useState)(false);
  const [conflictBannerDismissed, setConflictBannerDismissed] = (0, import_react9.useState)(false);
  const qrTabTouchedRef = (0, import_react9.useRef)(false);
  const updateQrTab = (0, import_react9.useCallback)((tab) => {
    qrTabTouchedRef.current = true;
    setSelectedTab(tab);
  }, []);
  const [activeTab, setActiveTab] = (0, import_react9.useState)(() => {
    try {
      const saved = localStorage.getItem("dsh-rm-settings-tab");
      if (saved === "access" || saved === "devices" || saved === "style" || saved === "storage") return saved;
    } catch (e) {
    }
    return "access";
  });
  const switchTab = (tab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem("dsh-rm-settings-tab", tab);
    } catch (e) {
    }
  };
  const refreshStatusOnly = (0, import_react9.useCallback)(() => {
    fetchStatus().then((data) => {
      if (data.tailscaleIp && !qrTabTouchedRef.current) {
        setSelectedTab("tailscale");
      }
      if (data.maxVisitsPerMinute) setMaxVisitsInput(String(data.maxVisitsPerMinute));
      if (data.maxFailedAttempts) setMaxFailedInput(String(data.maxFailedAttempts));
      if (data.lockDurationMs)
        setLockDurationMinsInput(String(Math.round(data.lockDurationMs / 6e4)));
      if (data.locale) {
        setCurrentLang(resolveLocale(ctx, data));
      }
      setStatus((prev) => ({
        ...prev,
        tailscaleIp: data.tailscaleIp || "",
        lanIp: data.lanIp || "",
        hasSecret: data.hasSecret,
        allowTailscale: data.allowTailscale,
        allowLan: data.allowLan,
        maxVisitsPerMinute: data.maxVisitsPerMinute || 60,
        maxFailedAttempts: data.maxFailedAttempts || 5,
        lockDurationMs: data.lockDurationMs || 9e5,
        devicesCount: data.devicesCount || 0,
        devices: data.devices || [],
        ipSecurityStats: data.ipSecurityStats || [],
        persistPath: data.persistPath || "",
        rsaKeyPath: data.rsaKeyPath || "",
        styleSnippetsPath: data.styleSnippetsPath || "",
        locale: data.locale || "zh",
        pairingBridgeMode: data.pairingBridgeMode || "pending",
        pairingBridgeConflict: data.pairingBridgeConflict || "",
        pairingBridgeConflictId: data.pairingBridgeConflictId || "",
        loading: false
      }));
    }).catch(() => {
    });
  }, [ctx]);
  const refreshStatusAndCode = (0, import_react9.useCallback)(() => {
    refreshStatusOnly();
    generatePairCode().then((data) => {
      if (data.success) {
        setStatus((prev) => ({
          ...prev,
          code: data.code,
          expiresAt: data.expiresAt
        }));
        const remain = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1e3));
        setTimeLeft(remain);
      }
    }).catch(() => {
    });
  }, [refreshStatusOnly]);
  (0, import_react9.useEffect)(() => {
    let cancelled = false;
    fetch("https://registry.npmjs.org/dsh-remote-mobile/latest", { cache: "no-store" }).then((res) => res.ok ? res.json() : Promise.reject(new Error("npm registry error"))).then((data) => {
      if (cancelled) return;
      const v = data && data.version ? String(data.version) : "";
      if (!v) return;
      setNpmLatestVersion(v);
      const installed = String(PLUGIN_VERSION).replace(/^v/i, "");
      setHasUpdate(compareVersions(v, installed) > 0);
    }).catch(() => {
      if (cancelled) return;
      setHasUpdate(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const compareVersions = (a, b) => {
    const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const da = pa[i] || 0;
      const db = pb[i] || 0;
      if (da > db) return 1;
      if (da < db) return -1;
    }
    return 0;
  };
  (0, import_react9.useEffect)(() => {
    refreshStatusAndCode();
    const localeUnsubs = [];
    try {
      const loc = ctx && (typeof ctx.get === "function" ? ctx.get("locale") : ctx.locale);
      if (loc && typeof loc.subscribe === "function") {
        const unsub = loc.subscribe(() => {
          setCurrentLang(resolveLocale(ctx, status));
        });
        if (typeof unsub === "function") localeUnsubs.push(unsub);
      }
    } catch (e) {
    }
    const handleDeviceUpdate = (e) => {
      if (!e || !e.detail) return;
      const detail = e.detail;
      if (detail.stats && Array.isArray(detail.stats)) {
        setStatus((prev) => ({ ...prev, ipSecurityStats: detail.stats }));
      }
      if (detail.device) {
        const dev = detail.device;
        setStatus((prev) => {
          const prevList = prev.devices || [];
          const nextList = [dev].concat(prevList.filter((d) => d.token !== dev.token));
          return {
            ...prev,
            devicesCount: nextList.length,
            devices: nextList
          };
        });
        const msg = detail.type === "device-connected" ? t("toastDeviceConnected", currentLang, {
          name: dev.deviceName || "Device",
          ip: dev.ip
        }) : t("toastDeviceOnline", currentLang, {
          name: dev.deviceName || "Device",
          ip: dev.ip
        });
        showToast(msg, "info", 4e3);
      }
      if (detail.type === "device-revoked") {
        setStatus((prev) => {
          const prevList = prev.devices || [];
          const nextList = detail.all ? [] : prevList.filter((d) => d.token !== detail.token);
          return {
            ...prev,
            devicesCount: nextList.length,
            devices: nextList
          };
        });
      }
      if (detail.type === "ip-security-alert") {
        const alertMsg = t("toastIpLocked", currentLang, { ip: detail.ip });
        showToast(alertMsg, "danger", 5e3);
      }
      refreshStatusOnly();
    };
    window.addEventListener("dsh-device-updated", handleDeviceUpdate);
    const pollTimer = setInterval(() => {
      refreshStatusOnly();
    }, 3e3);
    return () => {
      clearInterval(pollTimer);
      window.removeEventListener("dsh-device-updated", handleDeviceUpdate);
      for (let i = 0; i < localeUnsubs.length; i++) {
        localeUnsubs[i]();
      }
    };
  }, [refreshStatusAndCode, refreshStatusOnly, currentLang, ctx]);
  (0, import_react9.useEffect)(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1e3);
    return () => clearInterval(timer);
  }, [timeLeft]);
  const toggleTailscale = () => {
    const nextVal = !status.allowTailscale;
    updateBypassConfig(nextVal, status.allowLan).then(() => {
      setStatus((prev) => ({ ...prev, allowTailscale: nextVal }));
    });
  };
  const toggleLan = () => {
    const nextVal = !status.allowLan;
    if (nextVal) {
      const warnMsg = t("lanBypassConfirm", currentLang);
      if (!confirm(warnMsg)) return;
    }
    updateBypassConfig(status.allowTailscale, nextVal).then(() => {
      setStatus((prev) => ({ ...prev, allowLan: nextVal }));
    });
  };
  const saveSecret = () => {
    const trimmed = (secretInput || "").trim();
    if (!trimmed) {
      alert(t("secretInputPlaceholder", currentLang));
      return;
    }
    const hasLetter = /[a-zA-Z]/.test(trimmed);
    const hasNumber = /[0-9]/.test(trimmed);
    if (trimmed.length < 6 || !hasLetter || !hasNumber) {
      alert(t("secretWeakTip", currentLang));
      return;
    }
    updateSecret(trimmed).then((data) => {
      if (data.success) {
        setStatus((prev) => ({ ...prev, hasSecret: true }));
        setSecretInput("");
        showToast(
          currentLang === "en" ? "Persistent password saved!" : "\u957F\u671F\u8BBF\u95EE\u5BC6\u7801\u5DF2\u6210\u529F\u4FDD\u5B58\u5E76\u542F\u7528\uFF01",
          "success",
          3e3
        );
      } else {
        alert((currentLang === "en" ? "Save failed: " : "\u4FDD\u5B58\u5931\u8D25\uFF1A") + (data.reason || ""));
      }
    });
  };
  const clearSecret = () => {
    if (confirm(t("clearSecretConfirm", currentLang))) {
      clearSecretApi().then(() => {
        setStatus((prev) => ({ ...prev, hasSecret: false }));
        setSecretInput("");
        showToast(
          currentLang === "en" ? "Password cleared!" : "\u5DF2\u6210\u529F\u6E05\u9664\u957F\u671F\u8BBF\u95EE\u5BC6\u7801\uFF01",
          "info",
          3e3
        );
      });
    }
  };
  const revokeDevice = (token) => {
    if (confirm(t("revokeDeviceConfirm", currentLang))) {
      revokeDeviceApi(token).then(() => {
        refreshStatusAndCode();
        showToast(
          currentLang === "en" ? "Device disconnected!" : "\u5DF2\u6210\u529F\u8E22\u51FA\u8BE5\u8BBE\u5907\uFF01",
          "info",
          2500
        );
      });
    }
  };
  const revokeAll = () => {
    if (confirm(t("revokeAllConfirm", currentLang))) {
      revokeAllDevicesApi().then(() => {
        refreshStatusAndCode();
        showToast(
          currentLang === "en" ? "All devices disconnected!" : "\u5DF2\u6210\u529F\u6CE8\u9500\u5E76\u8E22\u4E0B\u7EBF\u6240\u6709\u8BBE\u5907\uFF01",
          "info",
          2500
        );
      });
    }
  };
  const unlockIp = (ip) => {
    if (confirm(t("unlockIpConfirm", currentLang, { ip }))) {
      unlockIpApi(ip).then(() => {
        refreshStatusAndCode();
        showToast(
          currentLang === "en" ? `IP ${ip} unlocked!` : `\u5DF2\u6210\u529F\u4E3A IP ${ip} \u89E3\u9664\u9501\u5B9A\uFF01`,
          "success",
          3e3
        );
      }).catch(() => {
      });
    }
  };
  const clearIpStats = () => {
    if (confirm(t("clearSecurityLogConfirm", currentLang))) {
      clearIpStatsApi().then(() => {
        refreshStatusAndCode();
        showToast(
          currentLang === "en" ? "Audit logs cleared!" : "\u5DF2\u6210\u529F\u6E05\u7A7A\u6240\u6709\u5B89\u5168\u5BA1\u8BA1\u65E5\u5FD7\uFF01",
          "success",
          2500
        );
      }).catch(() => {
      });
    }
  };
  const saveAdvancedConfig = () => {
    const visits = parseInt(maxVisitsInput, 10);
    const failed = parseInt(maxFailedInput, 10);
    const mins = parseInt(lockDurationMinsInput, 10);
    if (isNaN(visits) || visits <= 0 || isNaN(failed) || failed <= 0 || isNaN(mins) || mins <= 0) {
      alert(t("saveConfigFailTip", currentLang));
      return;
    }
    if (!confirm(t("saveConfigConfirm", currentLang))) {
      return;
    }
    setIsSaving(true);
    updateAdvancedSecurityOptions({
      maxVisitsPerMinute: visits,
      maxFailedAttempts: failed,
      lockDurationMs: mins * 60 * 1e3
    }).then((data) => {
      setIsSaving(false);
      if (data.success) {
        refreshStatusAndCode();
        showToast(t("saveConfigSuccessToast", currentLang), "success", 3e3);
      } else {
        alert((currentLang === "en" ? "Save failed: " : "\u4FDD\u5B58\u5931\u8D25\uFF1A") + (data.reason || ""));
      }
    }).catch(() => {
      setIsSaving(false);
      alert(currentLang === "en" ? "Network request failed, please try again." : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    });
  };
  const resetAdvancedConfigDefaults = () => {
    if (!confirm(t("restoreDefaultsConfirm", currentLang))) {
      return;
    }
    setMaxVisitsInput("60");
    setMaxFailedInput("5");
    setLockDurationMinsInput("15");
    setIsSaving(true);
    updateAdvancedSecurityOptions({
      maxVisitsPerMinute: 60,
      maxFailedAttempts: 5,
      lockDurationMs: 15 * 60 * 1e3
    }).then((data) => {
      setIsSaving(false);
      if (data.success) {
        refreshStatusAndCode();
        showToast(t("restoreDefaultsSuccessToast", currentLang), "success", 3e3);
      } else {
        alert((currentLang === "en" ? "Reset failed: " : "\u91CD\u7F6E\u5931\u8D25\uFF1A") + (data.reason || ""));
      }
    }).catch(() => {
      setIsSaving(false);
      alert(currentLang === "en" ? "Network request failed, please try again." : "\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    });
  };
  const copyDirectLink = () => {
    if (timeLeft <= 0) {
      alert(t("codeExpired", currentLang));
      return;
    }
    const effectiveQrIp = selectedTab === "tailscale" && status.tailscaleIp ? status.tailscaleIp : status.lanIp || "127.0.0.1";
    const port = typeof window !== "undefined" && window.location.port || "3080";
    const directLink = `http://${effectiveQrIp}:${port}/auth?token=${status.code || ""}`;
    copyText(directLink, t("copiedTip", currentLang));
    setStatus((prev) => ({ ...prev, copied: true }));
    setTimeout(() => {
      setStatus((prev) => ({ ...prev, copied: false }));
    }, 2e3);
  };
  const toastTimerRef = (0, import_react9.useRef)(null);
  const showToast = (0, import_react9.useCallback)((message, type = "success", duration = 2500) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), duration);
  }, []);
  const copyText = (text, successTip) => {
    const triggerToast = () => {
      showToast(
        successTip || (currentLang === "en" ? "Copied to clipboard!" : "\u5DF2\u6210\u529F\u590D\u5236\u5230\u526A\u8D34\u677F\uFF01"),
        "success",
        2500
      );
    };
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(triggerToast).catch(() => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          triggerToast();
        } catch (e) {
        }
      });
    } else {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        triggerToast();
      } catch (e) {
      }
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
    "div",
    {
      style: {
        padding: "2px 4px",
        color: "var(--dsw-alias-label-primary, inherit)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        position: "relative"
      },
      children: [
        toast ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            style: {
              position: "fixed",
              top: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 100010,
              background: toast.type === "danger" ? "linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))" : toast.type === "success" ? "linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))" : "linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))",
              color: "#ffffff",
              borderRadius: "10px",
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: "600",
              boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              pointerEvents: "none"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: toast.type === "danger" ? "\u{1F6A8}" : toast.type === "success" ? "\u2705" : "\u2139\uFE0F" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: toast.message })
            ]
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "4px"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { minWidth: "220px", flex: 1 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                      margin: "0 0 6px 0"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                        "h3",
                        {
                          style: {
                            fontSize: "20px",
                            fontWeight: "700",
                            margin: 0,
                            color: "var(--dsw-alias-label-primary, inherit)"
                          },
                          children: t("title", currentLang)
                        }
                      ),
                      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                        "div",
                        {
                          style: { position: "relative", display: "inline-flex", alignItems: "center" },
                          onMouseEnter: () => setShowVersionTip(true),
                          onMouseLeave: () => setShowVersionTip(false),
                          onClick: () => {
                            showToast(
                              `\u{1F4E6} dsh-remote-mobile ${PLUGIN_VERSION} (${currentLang === "en" ? "Build: " : "\u6784\u5EFA\u65F6\u95F4: "}${BUILD_TIME})`,
                              "info",
                              3e3
                            );
                          },
                          children: [
                            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                              "span",
                              {
                                style: {
                                  fontSize: "11px",
                                  padding: "2px 7px",
                                  borderRadius: "10px",
                                  background: "rgba(59,130,246,0.15)",
                                  color: "var(--dsw-alias-brand-primary, #3b82f6)",
                                  fontWeight: "600",
                                  cursor: "pointer",
                                  userSelect: "none",
                                  transition: "all 0.2s ease"
                                },
                                children: PLUGIN_VERSION
                              }
                            ),
                            showVersionTip ? /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                              "div",
                              {
                                style: {
                                  position: "absolute",
                                  top: "calc(100% + 6px)",
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  backgroundColor: "#0f172a",
                                  color: "#f8fafc",
                                  padding: "5px 10px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap",
                                  boxShadow: "0 8px 16px rgba(0,0,0,0.3)",
                                  border: "1px solid rgba(255,255,255,0.15)",
                                  zIndex: 9999,
                                  pointerEvents: "none",
                                  lineHeight: "1.4",
                                  textAlign: "center"
                                },
                                children: `${currentLang === "en" ? "Build: " : "\u6253\u5305\u65F6\u95F4: "}${BUILD_TIME}`
                              }
                            ) : null
                          ]
                        }
                      ),
                      hasUpdate && npmLatestVersion ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                        "a",
                        {
                          href: `https://www.npmjs.com/package/dsh-remote-mobile/v/${npmLatestVersion}`,
                          target: "_blank",
                          rel: "noopener noreferrer",
                          style: {
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 8px",
                            borderRadius: "10px",
                            background: "rgba(203, 36, 49, 0.12)",
                            border: "1px solid rgba(203, 36, 49, 0.3)",
                            color: "var(--dsw-alias-brand-primary, #f87171)",
                            fontSize: "11px",
                            fontWeight: "600",
                            textDecoration: "none",
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          },
                          children: [
                            "\u{1F680} ",
                            currentLang === "en" ? `Update available: v${npmLatestVersion}` : `\u53D1\u73B0\u65B0\u7248\u672C v${npmLatestVersion}`
                          ]
                        }
                      ) : null
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "div",
                  {
                    style: {
                      fontSize: "13px",
                      color: "var(--dsw-alias-label-tertiary, #888)"
                    },
                    children: t("subtitle", currentLang)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
                "a",
                {
                  href: "https://github.com/IceApriler/dsh-remote-mobile",
                  target: "_blank",
                  rel: "noopener noreferrer",
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    background: "var(--dsw-alias-bg-layer-3, rgba(128,128,128,0.1))",
                    border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))",
                    borderRadius: "8px",
                    color: "var(--dsw-alias-label-secondary, inherit)",
                    fontSize: "12px",
                    fontWeight: "500",
                    textDecoration: "none",
                    transition: "all 0.2s ease",
                    cursor: "pointer"
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("svg", { style: { width: "16px", height: "16px", fill: "currentColor" }, viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("path", { d: "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" }) }),
                    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { children: "dsh-remote-mobile" })
                  ]
                }
              )
            ]
          }
        ),
        status.pairingBridgeConflict && !conflictBannerDismissed ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid rgba(245, 158, 11, 0.45)",
              background: "rgba(245, 158, 11, 0.12)"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { style: { fontSize: "16px", lineHeight: "20px" }, children: "\u26A0\uFE0F" }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { flex: 1, minWidth: 0 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "div",
                  {
                    style: {
                      fontSize: "13px",
                      fontWeight: "700",
                      marginBottom: "4px",
                      color: "var(--dsw-alias-label-primary, inherit)"
                    },
                    children: t("conflictBannerTitle", currentLang)
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      lineHeight: 1.6,
                      whiteSpace: "pre-line",
                      color: "var(--dsw-alias-label-secondary, inherit)"
                    },
                    children: t("conflictBannerBody", currentLang, {
                      plugin: status.pairingBridgeConflict || t("conflictUnknownPlugin", currentLang)
                    })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      const plugin = status.pairingBridgeConflict || t("conflictUnknownPlugin", currentLang);
                      const entryId = status.pairingBridgeConflictId || "";
                      const report = t(
                        entryId ? "conflictReportText" : "conflictReportNoEntryIdText",
                        currentLang,
                        { plugin, entryId }
                      );
                      copyText(report, t("conflictCopiedTip", currentLang));
                    },
                    style: {
                      marginTop: "8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 10px",
                      fontSize: "12px",
                      fontWeight: "600",
                      borderRadius: "7px",
                      cursor: "pointer",
                      border: "1px solid rgba(245, 158, 11, 0.55)",
                      background: "rgba(245, 158, 11, 0.18)",
                      color: "var(--dsw-alias-label-primary, inherit)"
                    },
                    children: t("conflictCopyBtn", currentLang)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => setConflictBannerDismissed(true),
                  title: t("conflictBannerDismiss", currentLang),
                  style: {
                    flexShrink: 0,
                    width: "24px",
                    height: "24px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "12px",
                    background: "rgba(128, 128, 128, 0.15)",
                    color: "var(--dsw-alias-label-secondary, inherit)"
                  },
                  children: "\u2715"
                }
              )
            ]
          }
        ) : null,
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "div",
          {
            style: {
              display: "flex",
              gap: "14px",
              borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2))",
              paddingBottom: "0",
              marginBottom: "6px",
              overflowX: "auto",
              overflowY: "hidden",
              WebkitOverflowScrolling: "touch",
              scrollbarWidth: "none"
            },
            children: [
              { id: "access", label: t("tabAccess", currentLang) },
              { id: "devices", label: t("tabDevices", currentLang) },
              { id: "style", label: t("tabStyle", currentLang) },
              { id: "storage", label: t("tabStorage", currentLang) }
            ].map((item) => {
              const isActive = activeTab === item.id;
              return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => switchTab(item.id),
                  style: {
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "6px 2px 8px 2px",
                    fontSize: "13px",
                    fontWeight: isActive ? "600" : "400",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    color: isActive ? "var(--dsw-alias-label-primary, #111827)" : "var(--dsw-alias-label-tertiary, #8c8c8c)",
                    borderBottom: isActive ? "2px solid var(--dsw-alias-label-primary, #111827)" : "2px solid transparent",
                    marginBottom: "-1px",
                    transition: "all 0.2s ease"
                  },
                  children: item.label
                },
                item.id
              );
            })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: activeTab === "access" ? "flex" : "none", flexDirection: "column", gap: "16px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            NetworkCard,
            {
              status,
              toggleTailscale,
              toggleLan,
              copyText,
              lang: currentLang
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            QrPairingCard,
            {
              status,
              showCode,
              setShowCode,
              timeLeft,
              showQr,
              setShowQr,
              selectedTab,
              setSelectedTab: updateQrTab,
              generateQrSvg,
              refreshStatusAndCode,
              copyDirectLink,
              lang: currentLang
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            SecretCard,
            {
              status,
              secretInput,
              setSecretInput,
              showSecret,
              setShowSecret,
              saveSecret,
              clearSecret,
              lang: currentLang
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { style: { display: activeTab === "devices" ? "flex" : "none", flexDirection: "column", gap: "16px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            DeviceListCard,
            {
              status,
              revokeDevice,
              revokeAll,
              lang: currentLang
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            SecurityCard,
            {
              status,
              unlockIp,
              clearIpStats,
              lang: currentLang
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
            ConfigCard,
            {
              maxVisitsInput,
              setMaxVisitsInput,
              maxFailedInput,
              setMaxFailedInput,
              lockDurationMinsInput,
              setLockDurationMinsInput,
              saveAdvancedConfig,
              resetAdvancedConfigDefaults,
              isSaving,
              lang: currentLang,
              copyText
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { display: activeTab === "style" ? "flex" : "none", flexDirection: "column", gap: "16px" }, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(StylesCard, { lang: currentLang, showToast }) }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { style: { display: activeTab === "storage" ? "flex" : "none", flexDirection: "column", gap: "16px" }, children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(StorageCard, { status, lang: currentLang, copyText }) })
      ]
    }
  );
}

// src/client/utils/toast.js
function showGlobalDeviceToast(device, eventType) {
  if (typeof document === "undefined") return;
  var toastId = "dsh-global-device-toast";
  var existing = document.getElementById(toastId);
  if (existing) existing.remove();
  var isNewPair = eventType === "device-connected";
  var bgGradient = isNewPair ? "linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))" : "linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95))";
  var glowShadow = isNewPair ? "rgba(16, 185, 129, 0.3)" : "rgba(59, 130, 246, 0.3)";
  var icon = isNewPair ? "\u{1F389}" : "\u{1F4F6}";
  var title = isNewPair ? "\u65B0\u8BBE\u5907\u5DF2\u6210\u529F\u914D\u5BF9\u63A5\u5165\uFF01" : "\u5DF2\u6388\u6743\u8BBE\u5907\u5DF2\u91CD\u65B0\u4E0A\u7EBF\uFF01";
  var toast = document.createElement("div");
  toast.id = toastId;
  toast.style.cssText = [
    "position: fixed",
    "top: 24px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 9999999",
    "background: " + bgGradient,
    "color: white",
    "border-radius: 14px",
    "padding: 14px 20px",
    "box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35), 0 0 24px " + glowShadow,
    "display: flex",
    "align-items: center",
    "gap: 14px",
    "min-width: 340px",
    "max-width: 90vw",
    "backdrop-filter: blur(12px)",
    "-webkit-backdrop-filter: blur(12px)",
    "border: 1px solid rgba(255, 255, 255, 0.25)",
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    "animation: dshToastIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    "cursor: pointer"
  ].join(";");
  if (!document.getElementById("dsh-toast-anim-style")) {
    var style = document.createElement("style");
    style.id = "dsh-toast-anim-style";
    style.textContent = "@keyframes dshToastIn { from { opacity: 0; transform: translate(-50%, -20px) scale(0.95); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } } @keyframes dshToastOut { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -20px); } }";
    document.head.appendChild(style);
  }
  toast.innerHTML = [
    '<div style="font-size: 26px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">' + icon + "</div>",
    '<div style="flex: 1; min-width: 0;">',
    '  <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px; letter-spacing: 0.2px;">' + title + "</div>",
    '  <div style="font-size: 12px; opacity: 0.92; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + (device.deviceName || "\u79FB\u52A8\u7AEF\u8BBE\u5907") + " \xB7 IP: " + (device.ip || "\u672A\u77E5") + "</div>",
    "</div>",
    '<button id="dsh-toast-close" style="background: transparent; border: none; color: white; opacity: 0.8; font-size: 16px; cursor: pointer; padding: 4px 6px; line-height: 1; border-radius: 4px;">\u2715</button>'
  ].join("");
  document.body.appendChild(toast);
  var timer = setTimeout(function() {
    if (toast && toast.parentElement) {
      toast.style.animation = "dshToastOut 0.3s forwards";
      setTimeout(function() {
        if (toast.parentElement) toast.remove();
      }, 300);
    }
  }, 6e3);
  var closeBtn = toast.querySelector("#dsh-toast-close");
  if (closeBtn) {
    closeBtn.onclick = function(e) {
      e.stopPropagation();
      clearTimeout(timer);
      toast.remove();
    };
  }
}
function showGlobalSecurityToast(alertData) {
  if (typeof document === "undefined") return;
  var toastId = "dsh-global-security-toast";
  var existing = document.getElementById(toastId);
  if (existing) existing.remove();
  var toast = document.createElement("div");
  toast.id = toastId;
  toast.style.cssText = [
    "position: fixed",
    "top: 24px",
    "left: 50%",
    "transform: translateX(-50%)",
    "z-index: 9999999",
    "background: linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))",
    "color: white",
    "border-radius: 14px",
    "padding: 14px 20px",
    "box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4), 0 0 24px rgba(239, 68, 68, 0.4)",
    "display: flex",
    "align-items: center",
    "gap: 14px",
    "min-width: 360px",
    "max-width: 90vw",
    "backdrop-filter: blur(12px)",
    "-webkit-backdrop-filter: blur(12px)",
    "border: 1px solid rgba(255, 255, 255, 0.3)",
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    "animation: dshToastIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    "cursor: pointer"
  ].join(";");
  toast.innerHTML = [
    '<div style="font-size: 26px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">\u{1F6A8}</div>',
    '<div style="flex: 1; min-width: 0;">',
    '  <div style="font-size: 14px; font-weight: 700; margin-bottom: 2px; letter-spacing: 0.2px;">\u5B89\u5168\u62E6\u622A\u9884\u8B66</div>',
    '  <div style="font-size: 12px; opacity: 0.95; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">IP ' + (alertData.ip || "\u672A\u77E5") + " " + (alertData.reason || "\u5DF2\u89E6\u53D1\u5B89\u5168\u7194\u65AD\u9501\u5B9A\uFF01") + "</div>",
    "</div>",
    '<button id="dsh-sec-toast-close" style="background: transparent; border: none; color: white; opacity: 0.8; font-size: 16px; cursor: pointer; padding: 4px 6px; line-height: 1; border-radius: 4px;">\u2715</button>'
  ].join("");
  document.body.appendChild(toast);
  var timer = setTimeout(function() {
    if (toast && toast.parentElement) {
      toast.style.animation = "dshToastOut 0.3s forwards";
      setTimeout(function() {
        if (toast.parentElement) toast.remove();
      }, 300);
    }
  }, 7e3);
  var closeBtn = toast.querySelector("#dsh-sec-toast-close");
  if (closeBtn) {
    closeBtn.onclick = function(e) {
      e.stopPropagation();
      clearTimeout(timer);
      toast.remove();
    };
  }
}

// src/client/index.jsx
var inject = ["slots", "locale", "connection", "settingsScope", "remote"];
function apply(ctx) {
  if (typeof window !== "undefined") {
    window.__DSH_CLIENT_CTX__ = ctx;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover";
    if (!window.__DSH_REMOTE_MOBILE_SSE_LISTENER__) {
      window.__DSH_REMOTE_MOBILE_SSE_LISTENER__ = true;
      var initSse = function() {
        try {
          var eventSource = new EventSource("/api/remote-mobile/events");
          eventSource.onmessage = function(event) {
            try {
              var data = JSON.parse(event.data || "{}");
              if (data.type === "device-connected" && data.device) {
                showGlobalDeviceToast(data.device, "device-connected");
                window.dispatchEvent(new CustomEvent("dsh-device-updated", { detail: data }));
              } else if (data.type === "device-online" && data.device) {
                showGlobalDeviceToast(data.device, "device-online");
                window.dispatchEvent(new CustomEvent("dsh-device-updated", { detail: data }));
              } else if (data.type === "device-revoked") {
                window.dispatchEvent(new CustomEvent("dsh-device-updated", { detail: data }));
              } else if (data.type === "ip-security-alert") {
                showGlobalSecurityToast(data);
                window.dispatchEvent(new CustomEvent("dsh-device-updated", { detail: data }));
              } else if (data.type === "ip-security-updated") {
                window.dispatchEvent(new CustomEvent("dsh-device-updated", { detail: data }));
              }
            } catch (e) {
            }
          };
          eventSource.onerror = function() {
            try {
              eventSource.close();
            } catch (e) {
            }
            setTimeout(initSse, 3e3);
          };
        } catch (e) {
          setTimeout(initSse, 5e3);
        }
      };
      initSse();
    }
    var slots = null;
    try {
      if (ctx && typeof ctx.get === "function") {
        slots = ctx.get("slots");
      } else if (ctx && ctx.slots) {
        slots = ctx.slots;
      }
    } catch (e) {
    }
    if (slots && typeof slots.inject === "function") {
      try {
        slots.inject("settings.section", function() {
          var unregister = slots.register({
            name: "settings.section",
            id: "tailscale-mobile",
            order: 150,
            label: function() {
              var lang = resolveLocale(ctx);
              return lang === "en" ? "Remote & Mobile" : "\u8FDC\u7A0B\u4E0E\u79FB\u52A8\u7AEF";
            }
          }, TailscaleMobileSection);
          return function() {
            if (typeof unregister === "function") unregister();
          };
        });
      } catch (e) {
      }
    }
  }
}
var index_default = apply;


    return module.exports;
  }
});
