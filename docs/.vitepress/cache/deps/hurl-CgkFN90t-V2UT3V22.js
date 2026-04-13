import {
  c
} from "./chunk-TAAOGMRU.js";
import "./chunk-T3FBHZMX.js";
import {
  n
} from "./chunk-H6IEBA4O.js";
import "./chunk-T5EN5J43.js";
import "./chunk-LUYTPACB.js";
import {
  a
} from "./chunk-J5RHBISW.js";
import "./chunk-2KQF3VEE.js";
import "./chunk-ZYES45A2.js";
import "./chunk-3F74YA3Z.js";

// ../node_modules/.pnpm/vitepress-openapi@0.1.20_vitepress@1.6.4_@algolia+client-search@5.50.1_@types+node@25.6_c877224dbb2653f5496bc13231bf345d/node_modules/vitepress-openapi/dist/hurl-CgkFN90t.js
var a2 = Object.freeze(JSON.parse('{"displayName":"Hurl","name":"hurl","patterns":[{"include":"#comments"},{"include":"#sections"},{"include":"#http"},{"include":"#strings"},{"include":"#body"},{"include":"#request"}],"repository":{"body":{"patterns":[{"begin":"```graphql(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"}},"end":"```$","name":"meta.embedded.block.graphql.hurl","patterns":[{"include":"source.graphql"}]},{"begin":"```xml(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"}},"end":"```$","name":"meta.embedded.block.xml.hurl","patterns":[{"include":"text.xml"}]},{"begin":"```json(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"}},"end":"```$","name":"meta.embedded.block.json.hurl","patterns":[{"include":"text.json"}]},{"begin":"```csv(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"}},"end":"```$","name":"meta.embedded.block.csv.hurl","patterns":[{"include":"text.csv"}]},{"begin":"```hex(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"}},"contentName":"text.plain","end":"```$","name":"string.quoted.multiline.hurl"},{"begin":"```base64(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"}},"contentName":"text.plain","end":"```$","name":"string.quoted.multiline.hurl"},{"begin":"```([^,]*)(,\\\\w+)*$","beginCaptures":{"1":{"name":"support.type"},"2":{"name":"support.type"}},"end":"```$","name":"string.quoted.multiline.hurl"},{"match":"`(\\\\\\\\.|[^\\\\\\\\`])*`","name":"string.quoted.backtick.hurl","patterns":[{"include":"#escapes"}]},{"begin":"\\\\b(base64|hex),","beginCaptures":{"1":{"name":"support.function.name"}},"contentName":"text.plain","end":";","endCaptures":{"0":{"name":"support.function"}},"name":"support.function","patterns":[{"include":"#placeholders"}]}]},"comments":{"patterns":[{"match":"#.*$","name":"comment.line.number-sign.hurl"}]},"escapes":{"patterns":[{"match":"\\\\\\\\[\\"#\\\\\\\\`bnrtu]","name":"constant.character.escape.hurl"}]},"http":{"patterns":[{"captures":{"1":{"name":"constant.language.version.hurl"},"3":{"name":"constant.numeric.status.hurl"}},"match":"\\\\b(HTTP(/(?:1\\\\.0|1\\\\.1|2))?)([\\\\t ]+([0-9]{3}))?\\\\b"}]},"placeholders":{"patterns":[{"begin":"(\\\\{\\\\{)\\\\s*","beginCaptures":{"1":{"name":"string.interpolated.hurl"}},"contentName":"variable.other.hurl","end":"\\\\s*(}})","endCaptures":{"1":{"name":"string.interpolated.hurl"}}}]},"request":{"patterns":[{"match":"\\\\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\\\\b","name":"keyword.control.method.hurl"},{"captures":{"1":{"name":"string.unquoted.url.hurl","patterns":[{"include":"#placeholders"}]}},"match":"(https?://[^\\\\t\\\\n]+)\\\\s*$","name":"string.unquoted.url.hurl"},{"begin":"^([-0-9A-Za-z]+)(:)\\\\s*","beginCaptures":{"1":{"name":"entity.name.tag.header.hurl"},"2":{"name":"punctuation.separator.key-value.hurl"}},"contentName":"string.unquoted.hurl","end":"$","name":"entity.name.tag.header.hurl","patterns":[{"include":"#placeholders"}]}]},"sections":{"patterns":[{"match":"^\\\\s*\\\\[(QueryStringParams|Query|FormParams|Form|MultipartFormData|Multipart|Cookies|Captures|Asserts|BasicAuth|Options)]","name":"entity.name.section.hurl"}]},"strings":{"patterns":[{"match":"\\"(\\\\\\\\.|[^\\"\\\\\\\\])*\\"","name":"string.quoted.double.hurl","patterns":[{"include":"#escapes"}]}]}},"scopeName":"source.hurl","embeddedLangs":["graphql","xml","csv"]}'));
var p = [
  ...c,
  ...a,
  ...n,
  a2
];
export {
  p as default
};
//# sourceMappingURL=hurl-CgkFN90t-V2UT3V22.js.map
