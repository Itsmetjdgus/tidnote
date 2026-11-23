function createReportControl(targetType, targetId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'report-box';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'link-danger';
  toggle.textContent = t('report.btn');

  const form = document.createElement('div');
  form.className = 'report-form';
  form.hidden = true;

  const select = document.createElement('select');
  [
    ['spam', t('report.r_spam')],
    ['harassment', t('report.r_harassment')],
    ['privacy', t('report.r_privacy')],
    ['illegal', t('report.r_illegal')],
    ['self_harm', t('report.r_self_harm')],
    ['other', t('report.r_other')],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  });

  const details = document.createElement('textarea');
  details.rows = 2;
  details.maxLength = 500;
  details.placeholder = t('report.details');

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.textContent = t('report.send');

  const message = document.createElement('p');
  message.className = 'form-message';
  message.setAttribute('role', 'status');

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
  });

  submit.addEventListener('click', async () => {
    submit.disabled = true;
    message.className = 'form-message';
    message.textContent = '';

          const row = {
      target_type: targetType,
      reason: select.value,
      details: details.value.trim() || null,
    };
    if (targetType === 'profile') {
      row.target_user = targetId;
    } else {
      row.target_id = targetId;
    }

    const { error } = await db.from('reports').insert(row);

    submit.disabled = false;

    if (error) {
      if (error.code === '23505') {
        message.textContent = t('report.duplicate');
      } else if (error.message.includes('Too many')) {
        message.textContent = t('report.too_many');
      } else {
        message.textContent = t('report.failed');
      }
      return;
    }

     message.className = 'form-message ok';
    message.textContent = t('report.thanks');

    if (select.value === 'self_harm') {
      message.append(' ' + t('report.danger') + ' ');
      const helpLink = document.createElement('a');
      helpLink.href = 'help.html';
      helpLink.textContent = t('report.see_help');
      message.append(helpLink);
    }

    details.value = '';
  });                                              

  form.append(select, details, submit, message);
  wrapper.append(toggle, form);
  return wrapper;
}