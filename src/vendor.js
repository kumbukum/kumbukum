// Vendor JS bundle — Bootstrap + SweetAlert2 + Huebee + JSURL
export { Collapse, Dropdown, Modal, Offcanvas, Tab, Toast, Tooltip } from 'bootstrap';
export { default as Swal } from 'sweetalert2';
export { default as Huebee } from 'huebee';
import * as JSURL from 'jsurl';
export { JSURL };

// Make SweetAlert2 + JSURL available globally for non-module scripts
import Swal from 'sweetalert2';
window.Swal = Swal;
window.JSURL = JSURL;
