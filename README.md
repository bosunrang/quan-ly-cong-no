# Quản lý Chiết khấu MKT

Bộ khung giao diện desktop quản lý chi phí chiết khấu theo đơn hàng, khách hàng, khu vực, nhân viên kinh doanh và kỳ quý/năm.

## Công nghệ

- Electron cho ứng dụng Windows.
- React + TypeScript cho giao diện.
- Vite cho môi trường phát triển và build.
- Bản desktop lưu dữ liệu bằng SQLite tích hợp sẵn; bản chạy trên trình duyệt dùng `localStorage` và IndexedDB để thử giao diện.
- Dữ liệu được truy cập qua repository theo từng domain; seed chỉ dùng khi chưa có dữ liệu lưu.

## Chạy giao diện khi phát triển

```powershell
pnpm install
pnpm dev
```

Mở `http://localhost:5173` trên máy đang chạy app. Để một thiết bị khác cùng mạng Wi-Fi/LAN kiểm thử, mở địa chỉ `http://<IPv4-của-máy-chạy-app>:5173`. Máy chủ phải tiếp tục chạy và Windows Firewall cần cho phép Node.js trên mạng Private.

## Chạy bản desktop

```powershell
pnpm desktop
```

Lệnh trên build giao diện rồi mở ứng dụng Electron.

## Kiểm tra chất lượng

```powershell
pnpm check
pnpm test:coverage
pnpm build
```

`pnpm check` chạy lint, typecheck và toàn bộ test. Báo cáo coverage HTML được tạo tại `coverage/index.html`.

## Quy ước kiến trúc

- `app`: điều phối màn hình và layout cấp ứng dụng.
- `features`: giao diện và use case theo từng nghiệp vụ; không nhập chéo feature.
- `domain`: model, repository và dịch vụ nghiệp vụ; không phụ thuộc giao diện.
- `shared`: tiện ích và UI dùng chung; không phụ thuộc `domain`, `features` hoặc `app`.
- Màu giao diện chỉ được khai báo trong `src/styles/foundation/tokens.css`.

Các quy tắc trên cùng cấu hình sandbox, CSP và giới hạn điều hướng Electron được bảo vệ bằng test trong `tests/architecture.test.ts`.

## Phạm vi bộ khung hiện tại

- Dashboard tổng quan.
- Đối soát doanh số, tiền thu và chiết khấu.
- Danh sách đơn hàng nhập từ MISA.
- Danh mục sản phẩm tách riêng với chính sách chiết khấu theo từng đơn vị; hỗ trợ thiết lập hàng loạt, phiên bản theo thời gian và lịch sử tạm dừng/bật lại.
- Đơn hàng đối chiếu chính sách theo đúng sản phẩm, đơn vị, ngày hiệu lực và giữ bản chụp chính sách cho dữ liệu đã chốt.
- Quản lý khách hàng, người nhận chiết khấu, nhân viên và lịch sử phân công.
- Nhập danh mục khách hàng từ Excel, lưu dữ liệu cục bộ có version và cảnh báo lỗi lưu trữ.
- Điều hướng và trang khung cho kỳ chiết khấu, báo cáo, người dùng và nhật ký.

Chưa có cơ sở dữ liệu máy chủ hoặc đăng nhập thực. Dữ liệu MISA được nhập từ báo cáo chi tiết công nợ phải thu, lưu đầy đủ từng dòng và truy vấn theo đơn vị; phần báo cáo tổng hợp sẽ tiếp tục hoàn thiện theo nghiệp vụ.
