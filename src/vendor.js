// Vendor JS bundle — Bootstrap + SweetAlert2 + Huebee + JSURL + FilePond
export { Collapse, Dropdown, Modal, Offcanvas, Tab, Toast, Tooltip } from 'bootstrap';
export { default as Swal } from 'sweetalert2';
export { default as Huebee } from 'huebee';
import * as JSURL from 'jsurl';
export { JSURL };
import * as FilePond from 'filepond';
export { FilePond };

// Marked (markdown parser)
import { marked } from 'marked';
export { marked };

// Make SweetAlert2 + JSURL + FilePond + marked + Bootstrap Modal available globally for non-module scripts
import Swal from 'sweetalert2';
import { Modal as BsModal } from 'bootstrap';
window.Swal = Swal;
window.JSURL = JSURL;
window.FilePond = FilePond;
window.marked = marked;
window.BsModal = BsModal;
