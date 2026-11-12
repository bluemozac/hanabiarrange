class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function parseId(value, label = "ID") {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, `${label} 必須是正整數`);
  }
  return id;
}

function requiredText(value, label, maxLength = 100) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${label} 不可為空`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ApiError(400, `${label} 不可超過 ${maxLength} 個字元`);
  }
  return text;
}

function optionalText(value, label, maxLength = 100) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} 格式不正確`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new ApiError(400, `${label} 不可超過 ${maxLength} 個字元`);
  }
  return text;
}

function finiteNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ApiError(400, `${label} 必須介於 ${min} 與 ${max} 之間`);
  }
  return number;
}

function colorHex(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new ApiError(400, "顏色必須是六碼十六進位色值");
  }
  return value.toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function notFound(message = "找不到資料") {
  throw new ApiError(404, message);
}

module.exports = {
  ApiError,
  parseId,
  requiredText,
  optionalText,
  finiteNumber,
  colorHex,
  isPlainObject,
  notFound
};
