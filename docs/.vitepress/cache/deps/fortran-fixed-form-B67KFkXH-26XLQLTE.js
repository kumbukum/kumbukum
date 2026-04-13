import {
  n
} from "./chunk-GQWTM3CP.js";
import "./chunk-3F74YA3Z.js";

// ../node_modules/.pnpm/vitepress-openapi@0.1.20_vitepress@1.6.4_@algolia+client-search@5.50.1_@types+node@25.6_c877224dbb2653f5496bc13231bf345d/node_modules/vitepress-openapi/dist/fortran-fixed-form-B67KFkXH.js
var n2 = Object.freeze(JSON.parse('{"displayName":"Fortran (Fixed Form)","fileTypes":["f","F","f77","F77","for","FOR"],"injections":{"source.fortran.fixed - ( string | comment )":{"patterns":[{"include":"#line-header"},{"include":"#line-end-comment"}]}},"name":"fortran-fixed-form","patterns":[{"include":"#comments"},{"begin":"(?i)^(?=.{5}|(?<!^)\\\\t)\\\\s*(?:([0-9]{1,5})\\\\s+)?(format)\\\\b","beginCaptures":{"1":{"name":"constant.numeric.fortran"},"2":{"name":"keyword.control.format.fortran"}},"end":"(?=^(?![^\\\\n!#]{5}\\\\S))","name":"meta.statement.IO.fortran","patterns":[{"include":"#comments"},{"include":"#line-header"},{"match":"!.*$","name":"comment.line.fortran"},{"include":"source.fortran.free#string-constant"},{"include":"source.fortran.free#numeric-constant"},{"include":"source.fortran.free#operators"},{"include":"source.fortran.free#format-parentheses"}]},{"include":"#line-header"},{"include":"source.fortran.free"}],"repository":{"comments":{"patterns":[{"begin":"^[*Cc]","end":"\\\\n","name":"comment.line.fortran"},{"begin":"^ *!","end":"\\\\n","name":"comment.line.fortran"}]},"line-end-comment":{"begin":"(?<=^.{72})(?!\\\\n)","end":"(?=\\\\n)","name":"comment.line-end.fortran"},"line-header":{"captures":{"1":{"name":"constant.numeric.fortran"},"2":{"name":"keyword.line-continuation-operator.fortran"},"3":{"name":"source.fortran.free"},"4":{"name":"invalid.error.fortran"}},"match":"^(?!\\\\s*[!#])(?:([ \\\\d]{5} )|( {5}.)|(\\\\t)|(.{1,5}))"}},"scopeName":"source.fortran.fixed","embeddedLangs":["fortran-free-form"],"aliases":["f","for","f77"]}'));
var t = [
  ...n,
  n2
];
export {
  t as default
};
//# sourceMappingURL=fortran-fixed-form-B67KFkXH-26XLQLTE.js.map
