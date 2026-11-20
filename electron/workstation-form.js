const form = document.querySelector('form');
const address = document.querySelector('#server');
const status = document.querySelector('#status');
const button = document.querySelector('button');

window.workstationSetup.read().then((saved) => { address.value = saved ?? ''; })
  .catch(() => { status.textContent = 'Không thể đọc địa chỉ đã lưu. Hãy nhập lại địa chỉ máy chủ.'; });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '';
  try {
    const result = await window.workstationSetup.save(address.value);
    if (!result.ok) status.textContent = result.message;
  } catch {
    status.textContent = 'Không thể lưu địa chỉ. Hãy thử lại.';
  } finally {
    button.disabled = false;
  }
});
