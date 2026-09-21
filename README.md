# Hệ thống tạo & in thẻ ra vào cảng PSB

Ứng dụng React (Vite) dùng để tạo hàng loạt thẻ ra/vào cảng (xe máy & ô tô) dưới dạng file Word (`.docx`), tự động sinh mã QR và chèn ảnh thẻ/chân dung vào từng thẻ theo mẫu (template) có sẵn.

Ứng dụng có nhiều trang chạy song song trên cùng một site:

| Phiên bản | Route | Trạng thái |
| --- | --- | --- |
| v1 | `/` | Bản đầu tiên, nhập dữ liệu thủ công dạng text |
| **v2** | **`/the-ra-vao-v2`** | **Bản hiện tại, nhập trực tiếp từ file Excel — khuyến nghị sử dụng** |
| In vé xe | `/in-ve-xe` | Ghép nhiều file PDF (vé xe, mỗi file 1 trang) vào một file Word, 8 vé/trang |

## Yêu cầu

- Node.js 18+
- Yarn hoặc npm

## Cài đặt & chạy dự án

```bash
yarn install
yarn dev       # chạy dev server (Vite)
yarn build     # build production
yarn preview   # preview bản build
yarn lint      # kiểm tra lint
```

Sau khi chạy `yarn dev`, mở trình duyệt tới `/the-ra-vao-v2` để dùng bản wizard nhập từ Excel.

## Phiên bản v2 (`/the-ra-vao-v2`) — quy trình 4 bước

V2 là một wizard (Stepper) gồm 4 bước, cho phép nhập dữ liệu trực tiếp từ file Excel thay vì gõ tay từng dòng như v1.

### Bước 1 — Nhập file Excel

Tải lên file Excel theo mẫu `public/Mau_The_Ra_Vao_PSB.xlsx`. File cần có 2 sheet:

- `Danh sách Xe máy`
- `Danh sách xe ô tô`

### Bước 2 — Lựa chọn

- Chọn dòng bắt đầu / dòng kết thúc lấy dữ liệu trong sheet.
- Chọn loại phương tiện: **Xe máy** hoặc **Xe ô tô**.

Thứ tự cột được đọc từ sheet:

| Loại | Cột (theo thứ tự) |
| --- | --- |
| Xe máy | Họ tên, CCCD, Chức vụ, Đơn vị, Số xe, (bỏ trống), Ngày, Link/dữ liệu QR |
| Xe ô tô | Họ tên, Chức vụ, Đơn vị, Số xe, Hiệu xe, Số điện thoại, Ngày, Link/dữ liệu QR |

### Bước 3 — Chọn thư mục ảnh (chỉ áp dụng cho xe máy)

Chọn một thư mục ảnh chân dung trên máy. Ứng dụng tự động ghép ảnh với từng dòng dữ liệu dựa trên tên file theo định dạng:

```
<STT>. <Họ tên>.<đuôi ảnh>
```

Ví dụ: `1. Nguyen Van An.jpg`. Tên trong file ảnh được so khớp (không phân biệt dấu/hoa-thường) với cột "Họ tên" trong Excel; nếu không khớp, ứng dụng sẽ cảnh báo trong console nhưng vẫn tiếp tục xử lý.

Bước này được bỏ qua với xe ô tô (mẫu thẻ ô tô không có ảnh chân dung).

### Bước 4 — Xuất file

- Đặt tên file xuất ra.
- Nhấn **Tạo file Word** để render thẻ vào template (`public/template-motorbike.docx` hoặc `public/template-car.docx`) và tải file `.docx` về máy.

### Mã QR

Với mỗi thẻ, ứng dụng gọi API `api.qrserver.com` để sinh ảnh QR từ nội dung cột QR trong Excel, sau đó nhúng trực tiếp vào file Word (không cần link ảnh QR có sẵn như v1).

## Phiên bản v1 (`/`)

Bản đầu tiên: nhập dữ liệu thủ công bằng cách dán từng dòng text (các trường phân tách bởi dấu `|`), ảnh chân dung/QR lấy qua link Google Drive thay vì thư mục ảnh cục bộ. Vẫn được giữ lại để tham khảo/đối chiếu, nhưng không còn được phát triển tiếp — mọi tính năng mới nên hướng tới v2.

## Trang In vé xe (`/in-ve-xe`)

Chọn một thư mục chứa các file PDF vé xe (mỗi file được coi là 1 trang, tối đa 800 file). Các file PDF được sắp xếp theo tên (thứ tự tự nhiên, có so sánh số) trước khi xử lý, đảm bảo thứ tự vé trong file Word ra đúng như tên file, không phụ thuộc vào thứ tự trình duyệt trả về. Ứng dụng render trang đầu tiên của từng PDF thành ảnh ngay trên trình duyệt (bằng `pdfjs-dist`), sau đó ghép 8 ảnh/trang (lưới 4x2) vào một file Word (`.docx`) duy nhất bằng thư viện `docx`. Toàn bộ xử lý diễn ra phía client, không cần backend.

## Cấu trúc thư mục chính

```
src/
  App.jsx         # V1 — nhập liệu thủ công
  V2Page.jsx      # V2 — wizard nhập từ Excel (khuyến nghị)
  InVeXePage.jsx  # In vé xe — ghép PDF thành file Word 8 vé/trang
  main.jsx        # Router: "/" -> App, "/the-ra-vao-v2" -> V2Page, "/in-ve-xe" -> InVeXePage
public/
  Mau_The_Ra_Vao_PSB.xlsx     # File mẫu Excel cho v2
  template-motorbike.docx     # Template thẻ xe máy
  template-car.docx           # Template thẻ ô tô
```

## Công nghệ sử dụng

- React 19 + React Router + Vite
- MUI (Material UI) cho giao diện v2 và trang In vé xe
- `xlsx` — đọc file Excel
- `docxtemplater` + `pizzip` + `docxtemplater-image-module-free` — render dữ liệu (kèm ảnh) vào template Word
- `pdfjs-dist` — render trang PDF thành ảnh trong trình duyệt (trang In vé xe)
- `docx` — dựng file Word từ đầu (lưới ảnh 4x2) cho trang In vé xe
- `file-saver` — tải file kết quả về máy
