# PSB Tools

Bộ công cụ nội bộ PSB (React + Vite), chạy hoàn toàn phía client. Gồm các trang:

| Trang | Route | Mô tả |
| --- | --- | --- |
| Thẻ ra vào cảng | `/the-ra-vao-cang` (mặc định, `/` chuyển hướng tới đây) | Tạo hàng loạt thẻ ra/vào cảng (xe máy & ô tô) dạng file Word từ file Excel, tự sinh mã QR và chèn ảnh chân dung |
| Kiểm tra dữ liệu thẻ | `/the-ra-vao-cang/kiem-tra` | Kiểm tra file Excel, tên ảnh chân dung và tên ảnh người + xe trước khi tạo thẻ |
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

Sau khi chạy `yarn dev`, mở trình duyệt tới `/` (tự chuyển tới `/the-ra-vao-cang`).

## Thẻ ra vào cảng (`/the-ra-vao-cang`) — quy trình 5 bước

Wizard (Stepper) gồm 5 bước, nhập dữ liệu trực tiếp từ file Excel. Nên chạy trang kiểm tra `/the-ra-vao-cang/kiem-tra` (xem phần **Kiểm tra dữ liệu thẻ** bên dưới) trước để phát hiện lỗi dữ liệu và tên ảnh.

### Bước 1 — Tối ưu ảnh (tuỳ chọn)

Chọn một thư mục ảnh, ứng dụng thu nhỏ mỗi ảnh về tối đa 800px và nén JPEG chất lượng 80%, sau đó tải về file `.zip` (đặt theo tên thư mục). Tên file được giữ nguyên, chỉ đổi đuôi thành `.jpg`. Ảnh không đọc được sẽ được bỏ qua và liệt kê lại.

### Bước 2 — Nhập file Excel

Tải lên file Excel theo mẫu `public/Mau_The_Ra_Vao_PSB.xlsx`. File cần có 2 sheet:

- `Danh sách Xe máy`
- `Danh sách xe ô tô`

### Bước 3 — Lựa chọn

- Chọn dòng bắt đầu / dòng kết thúc lấy dữ liệu trong sheet.
- Chọn loại phương tiện: **Xe máy** hoặc **Xe ô tô**.

Thứ tự cột được đọc từ sheet:

| Loại | Cột (theo thứ tự) |
| --- | --- |
| Xe máy | Họ tên, CCCD, Chức vụ, Đơn vị, Số xe, Hiệu xe (không dùng), Ngày, Link hình người và xe (QR), Link hình ảnh thẻ (không dùng) |
| Xe ô tô | Họ tên, Chức vụ, Đơn vị, Số xe, Hiệu xe, Số điện thoại, Ngày, Link hình người và xe (QR) |

### Bước 4 — Chọn thư mục ảnh (chỉ áp dụng cho xe máy)

Chọn một thư mục ảnh chân dung trên máy. Ứng dụng tự động ghép ảnh với từng dòng dữ liệu dựa trên tên file theo định dạng:

```
<STT>. <Họ tên>.<đuôi ảnh>
```

Ảnh được sắp xếp theo STT rồi ghép **theo thứ tự** với các dòng trong khoảng đã chọn (ảnh thứ k ↔ dòng thứ k), không ghép theo tên. Nếu họ tên trong tên ảnh không khớp với cột "Họ tên", ứng dụng chỉ cảnh báo trong console và vẫn tiếp tục xử lý — vì vậy hãy kiểm tra tên ảnh ở trang `/the-ra-vao-cang/kiem-tra` trước.

Bước này được bỏ qua với xe ô tô (mẫu thẻ ô tô không có ảnh chân dung).

### Bước 5 — Xuất file

- Đặt tên file xuất ra.
- Nhấn **Tạo file Word** để render thẻ vào template (`public/template-motorbike.docx` hoặc `public/template-car.docx`) và tải file `.docx` về máy.

### Mã QR

Với mỗi thẻ, ứng dụng gọi API `api.qrserver.com` để sinh ảnh QR từ nội dung cột QR trong Excel, sau đó nhúng trực tiếp vào file Word.

## Kiểm tra dữ liệu thẻ (`/the-ra-vao-cang/kiem-tra`) — quy trình 3 bước

Trang kiểm tra (chỉ đọc, không sửa file) dùng trước khi tạo thẻ. Kết quả hiển thị dạng bảng; mỗi dòng liệt kê từng lỗi trên một dòng riêng, kèm gợi ý sửa.

### Bước 1 — Kiểm tra file Excel

Chọn file Excel, dòng bắt đầu / kết thúc và loại phương tiện. Mỗi dòng dữ liệu được kiểm tra bằng `validateRecord` trong `src/validatePlate.js`:

| Trường | Quy tắc |
| --- | --- |
| Tên | Không được trống, tối đa 19 ký tự |
| Chức danh | Tối đa 21 ký tự |
| Đơn vị | Tối đa 20 ký tự |
| Số xe | Đúng định dạng biển số (xem bên dưới); nếu sai sẽ gợi ý dạng đúng khi suy ra được |

Độ dài tính theo ký tự hiển thị (chữ có dấu tính 1 ký tự), bỏ qua khoảng trắng đầu/cuối.

Định dạng biển số chuẩn: `[2 số mã tỉnh][seri]-[số thứ tự]`, viết hoa, không khoảng trắng; số thứ tự là 4 số (`1234`) hoặc 5 số có dấu chấm (`123.45`).

- Ô tô: seri 1–2 chữ — `51H-1234`, `72A-123.45`
- Xe máy: seri 1–2 chữ, 1 chữ + 1 số, hoặc `MĐ` + 1 số — `72C1-095.36`, `72AC-197.52`, `72MĐ2-012.04`

### Bước 2 — Kiểm tra tên ảnh chân dung (chỉ xe máy)

Chọn thư mục ảnh thẻ chân dung. Cú pháp tên file:

```
<STT>. <Họ tên>.<đuôi ảnh>
```

Ví dụ: `1. Họ tên.jpg`. Bước này được bỏ qua với xe ô tô.

### Bước 3 — Kiểm tra tên ảnh người + xe

Chọn thư mục ảnh người + phương tiện. Cú pháp tên file:

```
<STT>. <Họ tên> <Biển số không có dấu chấm>.<đuôi ảnh>
```

Ví dụ: `1. Họ tên 72C1-09536.jpg` (Excel ghi `72C1-095.36`).

### Các lỗi được phát hiện ở bước 2 và 3

Ảnh được sắp xếp theo STT và ghép theo thứ tự với các dòng Excel đã chọn — giống cách trang tạo thẻ ghép ảnh — nên ảnh thứ k phải thuộc về dòng thứ k.

- Sai cú pháp sau STT: dùng dấu khác dấu chấm (`17, …`, `17 - …`), thiếu hoặc thừa dấu cách sau `STT.`. File vẫn được giữ đúng vị trí để không làm lệch các ảnh phía sau.
- Thừa dấu cách giữa các từ hoặc trước đuôi file.
- Trùng STT; thiếu ảnh cho một dòng; thừa ảnh không có dòng Excel tương ứng.
- Họ tên trong tên ảnh khác cột "Họ tên" (**không** phân biệt dấu và hoa/thường, ví dụ `Lo Van Ky` khớp với `Lò Văn Kỳ`).
- Bước 3: thiếu biển số, biển số có dấu chấm, hoặc biển số khác cột "Số xe".

Mỗi lỗi kèm **Tên đúng** của file, và nếu có ảnh khác trùng họ tên thì gợi ý tên file đó.

File không bắt đầu bằng số sẽ bị loại khỏi việc ghép, khiến các ảnh phía sau bị lệch một dòng.

## Trang In vé xe (`/in-ve-xe`)

Chọn một thư mục chứa các file PDF vé xe (mỗi file được coi là 1 trang, tối đa 800 file). Các file PDF được sắp xếp theo tên (thứ tự tự nhiên, có so sánh số) trước khi xử lý, đảm bảo thứ tự vé trong file Word ra đúng như tên file, không phụ thuộc vào thứ tự trình duyệt trả về. Ứng dụng render trang đầu tiên của từng PDF thành ảnh ngay trên trình duyệt (bằng `pdfjs-dist`), sau đó ghép 8 ảnh/trang (lưới 4x2) vào một file Word (`.docx`) duy nhất bằng thư viện `docx`. Toàn bộ xử lý diễn ra phía client, không cần backend.

## Cấu trúc thư mục chính

```
src/
  TheRaVaoCang.jsx  # Thẻ ra vào cảng — wizard nhập từ Excel
  KiemTraPage.jsx   # Kiểm tra dữ liệu Excel và tên ảnh trước khi tạo thẻ
  validatePlate.js  # Kiểm tra biển số và độ dài Tên / Chức danh / Đơn vị
  InVeXePage.jsx    # In vé xe — ghép PDF thành file Word 8 vé/trang
  main.jsx          # Router: "/" -> "/the-ra-vao-cang", "/the-ra-vao-cang/kiem-tra", "/in-ve-xe"
public/
  Mau_The_Ra_Vao_PSB.xlsx     # File mẫu Excel cho trang thẻ ra vào
  template-motorbike.docx     # Template thẻ xe máy
  template-car.docx           # Template thẻ ô tô
```

## Công nghệ sử dụng

- React 19 + React Router + Vite
- MUI (Material UI) cho giao diện
- `xlsx` — đọc file Excel
- `docxtemplater` + `pizzip` + `docxtemplater-image-module-free` — render dữ liệu (kèm ảnh) vào template Word
- `pdfjs-dist` — render trang PDF thành ảnh trong trình duyệt (trang In vé xe)
- `docx` — dựng file Word từ đầu (lưới ảnh 4x2) cho trang In vé xe
- `file-saver` — tải file kết quả về máy
