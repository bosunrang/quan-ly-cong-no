# Kiến trúc MKT Cost

Ứng dụng được tổ chức theo module nghiệp vụ. Component giao diện không tự đọc/ghi dữ liệu và không chứa cấu hình toàn cục.

## Cấu trúc chuẩn

```text
src/
  app/                 # Điều phối ứng dụng, cấu hình trang và routing
    layout/            # Header, Sidebar và app shell
  domain/              # Model và quy tắc nghiệp vụ, không phụ thuộc React/CSS
    customers/         # Customer aggregate, selector, seed và repository
    employees/         # Employee aggregate, factory, seed và repository
    assignments/       # Quy tắc giao, chuyển và kết thúc phụ trách
    settings/          # Cấu hình nhận diện và repository cấu hình
  features/            # Module màn hình độc lập
    dashboard/         # Màn hình tổng quan và style thuộc dashboard
    customers/         # Hồ sơ và người nhận chiết khấu
      components/      # Các khối giao diện con của trang
      customer.import  # Adapter đọc/kiểm tra dữ liệu khách hàng từ Excel
    sales/             # Điều phối nhân viên và phân công từng đơn vị
      components/      # Ba bước phân công và thẻ thống kê
    misa/              # Nhập Excel, chọn đơn vị và xem chi tiết bán hàng/công nợ MISA
    products/          # Danh mục, phân trang, nhập Excel và chính sách chiết khấu
      components/      # Bảng danh mục và các khối giao diện con
    reconciliation/    # Đối soát thu tiền và điều kiện chi
    settings/          # Màn hình và hook điều phối cài đặt
  shared/
    ui/                # Component giao diện dùng chung: Dialog, DateInput...
  styles/
    index.css          # Điểm nhập CSS duy nhất, quy định thứ tự cascade
    foundation/        # Font, token, reset/base và typography
    layout/            # App shell và responsive toàn ứng dụng
    shared/            # Style của component/dạng dữ liệu dùng chung
electron/              # Lớp desktop, SQLite và cầu nối IPC bảo mật
```

## Quy tắc bắt buộc

1. Màu, cỡ chữ và kích thước shell phải lấy từ `styles/foundation/tokens.css`; không viết mã màu riêng trong component mới.
2. Model, repository và quy tắc nghiệp vụ nằm trong `domain`; UI và state màn hình nằm trong `features`.
3. UI chỉ nhận dữ liệu và callback qua props hoặc hook của feature; không gọi trực tiếp `localStorage`, SQLite hay API.
4. Dữ liệu MISA được nhập vào model chuẩn trước khi tính chiết khấu; không tính trực tiếp trên dòng Excel thô.
5. Công thức chiết khấu nằm trong một service có kiểm thử, không lặp lại ở dashboard, báo cáo hoặc màn hình đối soát.
6. Mọi thay đổi dữ liệu production phải đi qua repository để có thể chuyển từ lưu nội bộ sang máy chủ mà không sửa UI.
7. Duyệt/chốt kỳ phải tạo nhật ký. Xóa cứng danh mục phải có hộp thoại xác nhận và dọn sạch dữ liệu phụ thuộc trong cùng một use case.
8. CSS thuộc riêng feature phải đặt cạnh feature đó; CSS nền toàn cục chỉ được import qua `styles/index.css`.
9. Tỉnh/thành chỉ là thuộc tính để lọc khách hàng; phân công bán hàng luôn gắn trực tiếp từng đơn vị với một nhân viên và có lịch sử hiệu lực.
10. Feature không được import model, logic hoặc CSS của feature khác. Phần dùng chung phải chuyển vào `domain` hoặc `shared` trước.
11. Page chỉ điều phối state và use case. Khối giao diện có trách nhiệm riêng phải tách vào thư mục `components`; không để một page phình thành bảng, form và dialog cùng lúc.
12. Khóa lưu trữ và migration thuộc repository. Refactor UI/domain không được tự ý đổi khóa để tránh mất dữ liệu người dùng.
13. Import Excel phải đi qua adapter kiểm tra tiêu đề, trường bắt buộc và mã trùng; người dùng luôn xem trước kết quả trước khi ghi repository.
14. Trạng thái dạng nhãn phải dùng `shared/ui/StatusPill` với đúng một trong năm ngữ nghĩa: `success` (hoàn tất/đang hoạt động), `warning` (chờ/chưa đủ), `info` (đã xử lý), `neutral` (tạm dừng/chưa thiết lập) và `danger` (lỗi/không hợp lệ). Feature không tự đặt màu, viền hoặc kích thước cho nhãn trạng thái.

## Hướng phụ thuộc

```text
app ──> features ──> domain
 │          │           │
 └────────> shared <─────┘

domain  -X-> features
feature -X-> feature khác
shared  -X-> features/domain nghiệp vụ
```

`domain` phải chạy được mà không cần React. `shared/ui` chỉ chứa giao diện tổng quát, không biết khách hàng hay nhân viên là gì.

## Hướng dữ liệu dự kiến

```text
Excel/MISA -> Import adapter -> Model chuẩn -> Repository -> Service đối soát
                                                   |              |
                                                   +-> Dashboard <-+
                                                   +-> Báo cáo
                                                   +-> Nhật ký
```

Ứng dụng desktop dùng SQLite tích hợp trong Electron qua preload/IPC giới hạn. Repository vẫn giữ cùng giao diện đọc/ghi; bản chạy trên trình duyệt dùng `localStorage` làm môi trường thử và bản dự phòng.

Schema SQLite phiên bản 6 chuẩn hóa khách hàng, người nhận, phân công, nhân viên, sản phẩm, chính sách, phân bổ người nhận (gồm mức chiết khấu và chi phí giữ lại riêng từng người) và chi tiết MISA. Danh sách sản phẩm được tìm kiếm, lọc, thống kê và phân trang trực tiếp trong SQLite; chi tiết chính sách chỉ được đọc khi mở một sản phẩm. Dòng chứng từ MISA được lưu riêng và chỉ truy vấn theo đơn vị đang chọn để không tải toàn bộ file lên bảng cùng lúc. Đối soát vẫn dùng dataset có phiên bản.

Các module `customers`, `employees`, `orders`, `products`, `misa` và `reconciliation` hiện có repository riêng. Page không được import seed trực tiếp. Dashboard đọc dữ liệu qua service tổng hợp và ánh xạ mã khách hàng về hồ sơ cùng phân công hiện tại, vì vậy thay đổi danh mục được phản ánh trên các màn hình liên quan khi mở lại.

## Lưu trữ cục bộ hiện tại

- Dữ liệu được ghi theo envelope `{ version, data }`; mỗi repository quản lý phiên bản schema riêng.
- Repository tự đọc và chuyển dữ liệu từ các khóa cũ, đồng thời giữ nguyên khóa cũ làm bản dự phòng.
- Dữ liệu JSON lỗi hoặc sai schema được sao lưu sang khóa `.corrupt.<timestamp>` trước khi app dùng dữ liệu mặc định.
- Lỗi đọc/ghi được đưa lên cảnh báo toàn ứng dụng. UI chỉ cập nhật state và báo thành công sau khi repository xác nhận đã ghi dữ liệu.
